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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function sse(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
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
