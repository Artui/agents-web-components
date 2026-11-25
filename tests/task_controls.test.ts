/**
 * The three task-control routes django-ag-ui (0.91.0) serves beside a thread.
 *
 * The request bodies are snake_case (`question_id`), unlike the step that names
 * the question (`questionId`), so each body is read back off the stubbed fetch
 * and compared whole rather than round-tripped through this module.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskControls } from "../src/core/task_controls.js";

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
}

function stub(response: () => Response | Promise<Response>): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return response();
    }),
  );
  return sent;
}

function accepted(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}

function refused(status: number, reason: string): Response {
  return new Response(JSON.stringify({ error: "refused", reason, thread_id: "t" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function controls(
  headers: Record<string, string> | Promise<Record<string, string>> = {},
): TaskControls {
  const made = TaskControls.from(
    "/agent/threads",
    () => headers,
    () => "include",
  );
  if (made === null) {
    throw new Error("expected task controls for a threads URL");
  }
  return made;
}

function body(sent: Sent): unknown {
  return JSON.parse(String(sent.init.body));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TaskControls", () => {
  it("is absent without a threads URL", () => {
    expect(
      TaskControls.from(
        null,
        () => ({}),
        () => undefined,
      ),
    ).toBeNull();
  });

  it("steers: POSTs the message to the task's steer route, with both ids encoded", async () => {
    const sent = stub(() => accepted({ thread_id: "t 1", task_id: "a/b", steered: true }));

    const result = await controls({ "X-CSRFToken": "tok" }).send("t 1", "a/b", {
      kind: "steer",
      message: "Only 2024.",
    });

    expect(result).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("/agent/threads/t%201/tasks/a%2Fb/steer/");
    expect(sent[0]?.init.method).toBe("POST");
    expect(sent[0]?.init.credentials).toBe("include");
    expect(sent[0]?.init.headers).toEqual({
      "X-CSRFToken": "tok",
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(body(sent[0] as Sent)).toEqual({ message: "Only 2024." });
  });

  it("answers in the route's snake_case, not the step's camelCase", async () => {
    const sent = stub(() => accepted({ answered: true }));

    await controls().send("t", "task-2", { kind: "answer", questionId: "q-1", answer: "2024" });

    expect(sent[0]?.url).toBe("/agent/threads/t/tasks/task-2/answer/");
    expect(body(sent[0] as Sent)).toEqual({ question_id: "q-1", answer: "2024" });
  });

  it("cancels with force stated either way", async () => {
    const sent = stub(() => accepted({ cancel_requested: true }));

    await controls().send("t", "task-3", { kind: "cancel", force: false });
    await controls().send("t", "task-3", { kind: "cancel", force: true });

    expect(sent[0]?.url).toBe("/agent/threads/t/tasks/task-3/cancel/");
    expect(sent.map(body)).toEqual([{ force: false }, { force: true }]);
  });

  it("waits for headers a host resolves asynchronously", async () => {
    const sent = stub(() => accepted({}));

    await controls(Promise.resolve({ Authorization: "Bearer x" })).send("t", "k", {
      kind: "cancel",
      force: false,
    });

    expect((sent[0]?.init.headers as Record<string, string> | undefined)?.["Authorization"]).toBe(
      "Bearer x",
    );
  });

  it("reports a refusal's status and reason code", async () => {
    stub(() => refused(409, "not_waiting"));

    const result = await controls().send("t", "k", {
      kind: "answer",
      questionId: "q",
      answer: "a",
    });

    expect(result).toEqual({ ok: false, status: 409, reason: "not_waiting" });
  });

  it("reads no reason off a refusal that is not the route's JSON", async () => {
    // An older server has no such route, and its 404 is a page, not JSON.
    const bodies = [
      () => new Response("<h1>Not Found</h1>", { status: 404 }),
      () => new Response(JSON.stringify({ reason: 7 }), { status: 400 }),
      () => new Response(JSON.stringify(["no_task"]), { status: 404 }),
      () => new Response(JSON.stringify("no_task"), { status: 409 }),
      () => new Response("null", { status: 409 }),
    ];
    for (const response of bodies) {
      stub(response);
      expect(await controls().send("t", "k", { kind: "cancel", force: false })).toEqual({
        ok: false,
        status: response().status,
        reason: null,
      });
    }
  });

  it("reports a fault as status 0, and never throws", async () => {
    stub(() => Promise.reject(new TypeError("offline")));

    expect(await controls().send("t", "k", { kind: "steer", message: "m" })).toEqual({
      ok: false,
      status: 0,
      reason: null,
    });
  });

  it("sends a 401 once: a control is not a safe request to retry", async () => {
    const sent = stub(() => new Response("", { status: 401 }));

    const result = await controls().send("t", "k", { kind: "steer", message: "m" });

    expect(result).toEqual({ ok: false, status: 401, reason: null });
    expect(sent).toHaveLength(1);
  });
});
