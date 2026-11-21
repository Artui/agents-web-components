/**
 * `DetachedHttpAgent.connectAgent()` replaying django-ag-ui's run log, fed the
 * bodies `scripts/record_detached_fixture.py` recorded from a real mount, so
 * the replay passes the real client's enforcement and verification here as it
 * has to in a browser.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpAgent } from "../src/core/create_http_agent.js";
import { DetachedHttpAgent } from "../src/core/detached_http_agent.js";
import recorded from "./fixtures/detached_runs.json";
import queued from "./fixtures/queued_start.json";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function sse(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function queuedAnswer(): Response {
  return new Response(JSON.stringify(queued.queuedStart.body), {
    status: queued.queuedStart.status,
    headers: { "Content-Type": queued.queuedStart.contentType },
  });
}

function assistantText(messages: readonly Message[]): string {
  return messages
    .filter((message) => message.role === "assistant")
    .map((message) => String(message.content))
    .join("");
}

describe("DetachedHttpAgent", () => {
  it("replays a run from its start through the configured fetch", async () => {
    const fetch = vi.fn(async () => sse(recorded.replayFromStart));
    const agent = new DetachedHttpAgent({
      url: "/agent/",
      headers: { "X-Static": "1" },
      fetch,
      threadId: "t1",
      eventsUrl: "/agent/threads/t1/events/",
    });
    await agent.connectAgent();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/agent/threads/t1/events/?after=0");
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ "X-Static": "1", Accept: "text/event-stream" });
    expect(assistantText(agent.messages)).toBe("partial answer and the rest");
  });

  it("replays a run joined mid-way, whose snapshot re-opens the answer", async () => {
    const agent = new DetachedHttpAgent({
      url: "/agent/",
      fetch: async () => sse(recorded.replayFromMidRun),
      threadId: "t1",
      eventsUrl: "/agent/threads/t1/events/",
    });
    await agent.connectAgent();

    expect(assistantText(agent.messages)).toBe("partial answer and the rest");
  });

  it("replays a cancelled run to its end", async () => {
    const agent = new DetachedHttpAgent({
      url: "/agent/",
      fetch: async () => sse(recorded.cancelledReplay),
      threadId: "t2",
      eventsUrl: "/agent/threads/t2/events/",
    });
    await agent.connectAgent();

    expect(assistantText(agent.messages)).toBe("partial answer");
  });

  it("is the base agent's no-op without a run log to read", async () => {
    const fetch = vi.fn(async () => sse(recorded.replayFromStart));
    const agent = new DetachedHttpAgent({ url: "/agent/", fetch });
    await agent.connectAgent();

    expect(fetch).not.toHaveBeenCalled();
    expect(agent.messages).toEqual([]);
  });

  it("gives each connect an abort controller of its own, which abortRun reaches", async () => {
    let signal: AbortSignal | undefined;
    const agent = new DetachedHttpAgent({
      url: "/agent/",
      fetch: async (_url, init) => {
        signal = init?.signal ?? undefined;
        return sse(recorded.replayFromStart);
      },
      eventsUrl: "/agent/threads/t1/events/",
    });
    agent.abortRun();
    await agent.connectAgent();

    expect(signal?.aborted).toBe(false);
    agent.abortRun();
    expect(signal?.aborted).toBe(true);
  });

  it("keeps its run log in a clone", () => {
    const agent = new DetachedHttpAgent({ url: "/agent/", eventsUrl: "/agent/threads/t1/events/" });

    expect(agent.clone().eventsUrl).toBe("/agent/threads/t1/events/");
  });
});

describe("a queued start", () => {
  const turn: Message = { id: "u-r1", role: "user", content: "Queue this one" };

  it("follows the start's JSON answer into the run log and runs to its end", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) =>
      init.method === "POST" ? queuedAnswer() : sse(queued.queuedReplay),
    );
    const agent = new DetachedHttpAgent({
      url: "/agent/",
      headers: { "X-Static": "1" },
      fetch,
      threadId: "t1",
      initialMessages: [turn],
      eventsUrl: "/agent/threads/t1/events/",
    });
    await agent.runAgent();

    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/agent/threads/t1/events/?after=0");
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ "X-Static": "1", Accept: "text/event-stream" });
    expect(init.signal).toBe((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal);
    expect(assistantText(agent.messages)).toBe("queued answer");
    expect(agent.followed).toBe(true);
  });

  it("is an error with no run log to follow it into", async () => {
    const agent = new DetachedHttpAgent({ url: "/agent/", fetch: async () => queuedAnswer() });

    await expect(agent.runAgent()).rejects.toThrow(/queued/);
  });

  it("is an error when the answer names another thread", async () => {
    const agent = new DetachedHttpAgent({
      url: "/agent/",
      fetch: async () => queuedAnswer(),
      threadId: "t9",
      eventsUrl: "/agent/threads/t9/events/",
    });

    await expect(agent.runAgent()).rejects.toThrow(/queued/);
  });

  it("leaves a streamed answer and a refusal to the base agent", async () => {
    const agent = new DetachedHttpAgent({
      url: "/agent/",
      fetch: async () => sse(recorded.replayFromStart),
      threadId: "t1",
      eventsUrl: "/agent/threads/t1/events/",
    });
    await agent.runAgent();
    expect(agent.followed).toBe(false);

    const refused = new DetachedHttpAgent({
      url: "/agent/",
      fetch: async () =>
        new Response(JSON.stringify(recorded.busyStart.body), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      threadId: "t1",
      eventsUrl: "/agent/threads/t1/events/",
    });
    await expect(refused.runAgent()).rejects.toMatchObject({ status: 409 });

    const bare = new Response(null, { status: 200 });
    const untyped = new DetachedHttpAgent({ url: "/agent/", fetch: async () => bare });
    expect(await untyped.fetch("/agent/", { method: "POST" })).toBe(bare);
  });

  it("reads its run log when it runs, not when it is built", async () => {
    let log: string | undefined;
    const fetch = vi.fn(async (_url: string, init: RequestInit) =>
      init.method === "POST" ? queuedAnswer() : sse(queued.queuedReplay),
    );
    const agent = new DetachedHttpAgent({
      url: "/agent/",
      fetch,
      threadId: "t1",
      eventsUrl: () => log,
    });
    expect(agent.eventsUrl).toBeUndefined();
    log = "/late/threads/t1/events/";
    await agent.runAgent();

    expect(fetch.mock.calls[1]?.[0]).toBe("/late/threads/t1/events/?after=0");
    expect(agent.clone().eventsUrl).toBe("/late/threads/t1/events/");
  });
});

describe("createHttpAgent's replay", () => {
  it("goes through the element's wrapper: the live header overlay and the cookie policy", async () => {
    const fetch = vi.fn(async () => sse(recorded.replayFromStart));
    vi.stubGlobal("fetch", fetch);
    const agent = createHttpAgent({
      endpoint: "/agent/",
      getHeaders: () => ({ "X-CSRFToken": "fresh" }),
      credentials: "include",
      threadId: "t1",
      eventsUrl: "/agent/threads/t1/events/",
    });
    await agent.connectAgent();

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("x-csrftoken")).toBe("fresh");
    expect(new Headers(init.headers).get("accept")).toBe("text/event-stream");
    expect(init.credentials).toBe("include");
  });
});

describe("createHttpAgent's run log", () => {
  it("is read per call from getEventsUrl, which wins over eventsUrl", async () => {
    const fetch = vi.fn(async () => sse(recorded.replayFromStart));
    vi.stubGlobal("fetch", fetch);
    let log = "/agent/threads/t1/events/";
    const agent = createHttpAgent({
      endpoint: "/agent/",
      threadId: "t1",
      eventsUrl: "/old/threads/t1/events/",
      getEventsUrl: () => log,
    });
    log = "/late/threads/t1/events/";
    await agent.connectAgent();

    const [url] = fetch.mock.calls[0] as unknown as [string];
    expect(url).toBe("/late/threads/t1/events/?after=0");
  });
});
