/**
 * The inbox `<ag-ui-agents>` keeps fresh: django-ag-ui's `inbox/` rows, every
 * agent's, by ETag polling or by its SSE stream.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiAgents } from "../src/agents/ag_ui_agents.js";
import { defineAgents } from "../src/agents/define_agents.js";
import type { InboxChangeDetail, InboxRow } from "../src/agents/types.js";
import { AGENTS_TAG, INBOX_CHANGE_EVENT } from "../src/constants.js";

defineAgents();

const INBOX = "/home/inbox/";
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

const waiting = {
  thread_id: "w",
  agent_id: "board",
  title: "Waits",
  updated_at: "2026-11-23T10:00:05+00:00",
  preview: "approve?",
  status: "waiting",
  last_read_at: null,
  interrupts: [{ id: "i1", reason: "approval" }],
};
const failed = {
  thread_id: "f",
  agent_id: "support",
  title: "Broke",
  updated_at: "2026-11-23T10:00:04+00:00",
  preview: "",
  status: "failed",
  reason: "error",
  last_read_at: "2026-11-23T10:00:01+00:00",
};
const running = {
  thread_id: "r",
  agent_id: "board",
  title: "Works",
  updated_at: "2026-11-23T10:00:03+00:00",
  preview: "",
  status: "running",
  last_read_at: "2026-11-23T10:00:01+00:00",
};
const plain = {
  thread_id: "p",
  agent_id: "notes",
  title: "Plain",
  updated_at: null,
  preview: "",
};

function inbox(threads: readonly object[], etag = '"i1"'): Response {
  return new Response(JSON.stringify({ threads }), {
    status: 200,
    headers: { "content-type": "application/json", ETag: etag },
  });
}

function provider(attributes: Record<string, string> = {}): AgUiAgents {
  const element = document.createElement(AGENTS_TAG) as AgUiAgents;
  element.setAttribute("data-inbox-url", INBOX);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

function received(home: AgUiAgents): (readonly InboxRow[])[] {
  const got: (readonly InboxRow[])[] = [];
  home.addEventListener(INBOX_CHANGE_EVENT, (event) =>
    got.push((event as CustomEvent<InboxChangeDetail>).detail.threads),
  );
  return got;
}

beforeEach(() => {
  document.body.replaceChildren();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("<ag-ui-agents> inbox by polling", () => {
  it("hands on every agent's rows, each with its agent, and asks again with the ETag", async () => {
    fetchMock.mockResolvedValueOnce(inbox([waiting, failed, running, plain]));
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }));
    const home = provider();
    const got = received(home);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);

    expect(got).toHaveLength(1);
    expect(home.inbox).toEqual([
      {
        threadId: "w",
        agentId: "board",
        title: "Waits",
        updatedAt: Date.parse(waiting.updated_at),
        preview: "approve?",
        status: "waiting",
        unread: false,
        interrupts: waiting.interrupts,
      },
      {
        threadId: "f",
        agentId: "support",
        title: "Broke",
        updatedAt: Date.parse(failed.updated_at),
        preview: "",
        status: "failed",
        unread: true,
        reason: "error",
      },
      {
        threadId: "r",
        agentId: "board",
        title: "Works",
        updatedAt: Date.parse(running.updated_at),
        preview: "",
        status: "running",
        unread: false,
      },
      { threadId: "p", agentId: "notes", title: "Plain", updatedAt: Number.NaN, preview: "" },
    ]);

    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenLastCalledWith(INBOX, { headers: { "If-None-Match": '"i1"' } });
    expect(got).toHaveLength(1);
  });

  it("carries a reason only on a failed row and interrupts only on a waiting one", async () => {
    fetchMock.mockResolvedValueOnce(
      inbox([
        { ...failed, thread_id: "f-none", reason: undefined },
        { ...failed, thread_id: "f-null", reason: null },
        { ...failed, thread_id: "f-number", reason: 7 },
        { ...running, thread_id: "r-reason", reason: "stale" },
        { ...waiting, thread_id: "w-reason", reason: "stale" },
        { ...waiting, thread_id: "w-none", interrupts: undefined },
        { ...running, thread_id: "r-interrupts", interrupts: waiting.interrupts },
        { ...failed, thread_id: "f-interrupts", interrupts: waiting.interrupts },
      ]),
    );
    const home = provider();
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);

    const byId = Object.fromEntries(home.inbox.map((row) => [row.threadId, row]));
    for (const id of ["f-none", "f-null", "f-number", "r-reason", "w-reason", "w-none"]) {
      expect(byId[id], id).toBeDefined();
    }
    for (const id of ["f-none", "f-null", "f-number", "r-reason", "w-reason"]) {
      expect(byId[id], id).not.toHaveProperty("reason");
    }
    for (const id of ["w-none", "r-interrupts", "f-interrupts"]) {
      expect(byId[id], id).not.toHaveProperty("interrupts");
    }
    expect(byId["w-reason"]).toHaveProperty("interrupts", waiting.interrupts);
    expect(byId["f-none"]).toHaveProperty("status", "failed");
  });

  it("polls for an explicit poll and for a transport it does not know", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(inbox([plain])));
    const home = provider({ "data-inbox-transport": "poll" });
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[1]?.headers)).toEqual([
      {},
      { "If-None-Match": '"i1"' },
    ]);

    home.setAttribute("data-inbox-transport", "websocket");
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock.mock.calls.at(-1)?.[1]?.headers).not.toHaveProperty("Accept");
  });

  it("hands on nothing for a failed, refused or malformed answer, and keeps asking", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response("no", { status: 500 }))
      .mockResolvedValueOnce(new Response("{", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const home = provider({ credentials: "same-origin" });
    const got = received(home);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(15000);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenCalledWith(INBOX, { headers: {}, credentials: "same-origin" });
    expect(got).toEqual([[]]);
  });

  it("stops on disconnect, and restarts on a new URL or transport", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(inbox([])));
    const home = provider();
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    home.remove();
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    document.body.append(home);
    home.setAttribute("data-inbox-url", "/other/inbox/");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenLastCalledWith("/other/inbox/", expect.anything());
    expect(fetchMock).toHaveBeenCalledTimes(2);

    home.setAttribute("data-inbox-url", "");
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks nothing without an inbox URL", async () => {
    const home = document.createElement(AGENTS_TAG) as AgUiAgents;
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(20000);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(home.inbox).toEqual([]);
  });
});

describe("<ag-ui-agents> inbox by stream", () => {
  it("follows the SSE stream and names the last frame when it reconnects", async () => {
    const frame = `id: "s1"\ndata: ${JSON.stringify({ threads: [waiting] })}\n\n`;
    fetchMock.mockResolvedValueOnce(
      new Response(frame, { status: 200, headers: { "content-type": "text/event-stream" } }),
    );
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const home = provider({ "data-inbox-transport": "stream" });
    const got = received(home);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);

    expect(got.map((rows) => rows.map((row) => row.threadId))).toEqual([["w"]]);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ Accept: "text/event-stream" });

    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({
      Accept: "text/event-stream",
      "Last-Event-ID": '"s1"',
    });
  });
});
