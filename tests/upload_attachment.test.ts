import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadAttachment } from "../src/core/upload_attachment.js";
import { type FakeXhrController, installFakeXhr } from "./helpers/fake_xhr.js";

let xhr: FakeXhrController;

beforeEach(() => {
  xhr = installFakeXhr();
});

afterEach(() => {
  xhr.restore();
});

function file(): File {
  return new File(["hello"], "notes.txt", { type: "text/plain" });
}

const REF_JSON = JSON.stringify({ id: "a1", name: "notes.txt", mime: "text/plain", size: 5 });

describe("uploadAttachment", () => {
  it("posts multipart with headers and resolves the ref", async () => {
    const promise = uploadAttachment(file(), {
      url: "/agent/attachments/",
      headers: { "X-CSRF": "t" },
    });
    const req = xhr.last();
    expect(req.method).toBe("POST");
    expect(req.url).toBe("/agent/attachments/");
    expect(req.headers["X-CSRF"]).toBe("t");
    expect(req.body).toBeInstanceOf(FormData);
    req.succeed(201, REF_JSON);
    await expect(promise).resolves.toEqual({
      id: "a1",
      name: "notes.txt",
      mime: "text/plain",
      size: 5,
    });
  });

  it("sets withCredentials only for the include mode", async () => {
    for (const [credentials, expected] of [
      ["include", true],
      ["same-origin", false],
      [undefined, false],
    ] as const) {
      const promise = uploadAttachment(
        file(),
        credentials === undefined ? { url: "/u/" } : { url: "/u/", credentials },
      );
      expect(xhr.last().withCredentials).toBe(expected);
      xhr.last().succeed(201, REF_JSON);
      await promise;
    }
  });

  it("includes url when the server returns one", async () => {
    const promise = uploadAttachment(file(), { url: "/u/" });
    xhr
      .last()
      .succeed(
        201,
        JSON.stringify({ id: "a1", name: "n", mime: "text/plain", size: 5, url: "/d/a1/" }),
      );
    await expect(promise).resolves.toMatchObject({ url: "/d/a1/" });
  });

  it("reports upload progress as a fraction", async () => {
    const onProgress = vi.fn();
    const promise = uploadAttachment(file(), { url: "/u/", onProgress });
    xhr.last().emitProgress(50, 100);
    expect(onProgress).toHaveBeenLastCalledWith(0.5);
    xhr.last().succeed(201, REF_JSON);
    await promise;
  });

  it("treats a zero-total progress event as 0", async () => {
    const onProgress = vi.fn();
    const promise = uploadAttachment(file(), { url: "/u/", onProgress });
    xhr.last().emitProgress(0, 0);
    expect(onProgress).toHaveBeenLastCalledWith(0);
    xhr.last().succeed(201, REF_JSON);
    await promise;
  });

  it("ignores a non-computable progress event", async () => {
    const onProgress = vi.fn();
    const promise = uploadAttachment(file(), { url: "/u/", onProgress });
    xhr.last().emitProgress(1, 2, false);
    expect(onProgress).not.toHaveBeenCalled();
    xhr.last().succeed(201, REF_JSON);
    await promise;
  });

  it.each([
    {
      case: "with the server error message on a 4xx",
      status: 415,
      body: JSON.stringify({ error: "content type not allowed" }),
      message: "content type not allowed",
    },
    {
      case: "with a status message when the error body is not JSON",
      status: 500,
      body: "<html>boom</html>",
      message: "upload failed (500)",
    },
    {
      case: "with a status message when the error JSON lacks an 'error'",
      status: 413,
      body: JSON.stringify({ detail: "too big" }),
      message: "upload failed (413)",
    },
    {
      case: "when the success body is unreadable",
      status: 201,
      body: "not json",
      message: "unreadable response",
    },
    {
      case: "when the success body is missing fields",
      status: 201,
      body: JSON.stringify({ id: "a1" }),
      message: "unreadable response",
    },
    {
      case: "when the success body is not an object",
      status: 201,
      body: "42",
      message: "unreadable response",
    },
  ])("rejects $case", async ({ status, body, message }) => {
    const promise = uploadAttachment(file(), { url: "/u/" });
    xhr.last().succeed(status, body);
    await expect(promise).rejects.toThrow(message);
  });

  it("rejects on a network error", async () => {
    const promise = uploadAttachment(file(), { url: "/u/" });
    xhr.last().fail();
    await expect(promise).rejects.toThrow("upload failed");
  });

  it("aborts when the signal fires and rejects", async () => {
    const controller = new AbortController();
    const promise = uploadAttachment(file(), { url: "/u/", signal: controller.signal });
    controller.abort();
    expect(xhr.last().aborted).toBe(true);
    await expect(promise).rejects.toThrow("cancelled");
  });

  it("sends nothing for a signal that fired before it began, as while async headers resolved", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadAttachment(file(), { url: "/u/", signal: controller.signal }),
    ).rejects.toThrow("cancelled");
    expect(xhr.instances).toHaveLength(0);
  });
});
