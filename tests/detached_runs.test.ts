/** The probe and the cancel beside `data-threads-url`, answered with the recorded bodies. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { DetachedRuns } from "../src/core/detached_runs.js";
import recorded from "./fixtures/detached_runs.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function runs(credentials?: RequestCredentials): DetachedRuns {
  return new DetachedRuns(
    "/agent/threads",
    (url) => ({ "X-For": url }),
    () => credentials,
  );
}

describe("DetachedRuns", () => {
  it("derives each thread's routes from the threads URL", () => {
    expect(runs().eventsUrl("a b")).toBe("/agent/threads/a%20b/events/");
  });

  it("reads a running run from one JSON page of its log", async () => {
    const fetch = vi.fn(async () => json(200, recorded.probeRunning.body));
    vi.stubGlobal("fetch", fetch);

    expect(await runs("include").running("t1")).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/agent/threads/t1/events/?after=0&limit=1");
    expect(init.headers).toEqual({ "X-For": url, Accept: "application/json" });
    expect(init.credentials).toBe("include");
  });

  it.each([
    ["an idle run", () => json(200, recorded.probeIdle.body)],
    ["a parked run", () => json(200, recorded.probeParked.body)],
    ["a thread that never ran", () => json(404, recorded.probeNeverRan.body)],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 })],
  ])("answers no for %s", async (_name, answer) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer()),
    );

    expect(await runs().running("t1")).toBe(false);
  });

  it("answers no when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );

    expect(await runs().running("t1")).toBe(false);
  });

  it("posts a cancel, and says nothing whether it lands, finds no run, or fails", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(202, recorded.cancelAccepted.body))
      .mockResolvedValueOnce(json(404, recorded.cancelGone.body))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);

    await runs().cancel("t1");
    await runs().cancel("t1");
    await runs().cancel("t1");
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/agent/threads/t1/cancel/");
    expect(init).toEqual({ method: "POST", headers: { "X-For": url } });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
