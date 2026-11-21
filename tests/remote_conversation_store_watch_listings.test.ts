import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadMeta } from "../src/core/conversation_store.js";
import { RemoteConversationStore } from "../src/core/remote_conversation_store.js";

const fetchMock = vi.fn();
const URL_ = "https://x/agent/threads/";
const row = (id: string, updated: string, read: string | null) => ({
  thread_id: id,
  title: id,
  updated_at: updated,
  preview: "",
  status: "idle",
  last_read_at: read,
});
function list(rows: object[], etag: string): Response {
  return new Response(JSON.stringify({ threads: rows }), {
    status: 200,
    headers: { "content-type": "application/json", ETag: etag },
  });
}
const notModified = (etag: string) => new Response(null, { status: 304, headers: { ETag: etag } });
async function flush(): Promise<void> {
  for (let i = 0; i < 30; i += 1) {
    await Promise.resolve();
  }
}

describe("RemoteConversationStore watch beside other listings", () => {
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("hands on the list as it stands when a poll watch starts after a listing", async () => {
    const unread = row("t1", "2026-01-01T00:00:05+00:00", "2026-01-01T00:00:01+00:00");
    fetchMock.mockResolvedValueOnce(list([unread], '"e1"'));
    const store = new RemoteConversationStore(URL_);
    await store.listThreads();
    fetchMock.mockResolvedValue(notModified('"e1"'));
    const got: (readonly ThreadMeta[])[] = [];
    const stop = store.watchThreads((t) => got.push(t), "poll");
    await vi.advanceTimersByTimeAsync(11000);
    stop();
    expect(got.length).toBeGreaterThan(0);
  });

  it("hands on the newer list when a 304 answers after a newer listing", async () => {
    const store = new RemoteConversationStore(URL_);
    fetchMock.mockResolvedValueOnce(list([row("old", "2026-01-01T00:00:01+00:00", null)], '"e1"'));
    await store.listThreads();
    let answerPoll: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (answerPoll = r)));
    const got: string[][] = [];
    const stop = store.watchThreads((t) => got.push(t.map((m) => m.threadId)), "poll");
    await vi.advanceTimersByTimeAsync(0);
    fetchMock.mockResolvedValueOnce(list([row("new", "2026-01-01T00:00:02+00:00", null)], '"e2"'));
    const listed = await store.listThreads();
    answerPoll(notModified('"e1"'));
    await flush();
    fetchMock.mockResolvedValue(notModified('"e2"'));
    await vi.advanceTimersByTimeAsync(11000);
    stop();
    expect(listed.map((m) => m.threadId)).toEqual(["new"]);
    expect(got.at(-1) ?? ["(none)"]).toEqual(["new"]);
  });

  it("hands on a change another listing saw first", async () => {
    const store = new RemoteConversationStore(URL_);
    fetchMock.mockResolvedValueOnce(list([row("old", "2026-01-01T00:00:01+00:00", null)], '"e1"'));
    const got: string[][] = [];
    const stop = store.watchThreads((t) => got.push(t.map((m) => m.threadId)), "poll");
    await vi.advanceTimersByTimeAsync(0);
    expect(got).toEqual([["old"]]);
    fetchMock.mockResolvedValueOnce(list([row("new", "2026-01-01T00:00:02+00:00", null)], '"e2"'));
    await store.waitingInterrupts("new");
    fetchMock.mockResolvedValue(notModified('"e2"'));
    await vi.advanceTimersByTimeAsync(11000);
    stop();
    expect(got.at(-1)).toEqual(["new"]);
  });

  it("asks a stream watch started after a listing for the list from the start", async () => {
    fetchMock.mockResolvedValueOnce(list([row("t1", "2026-01-01T00:00:01+00:00", null)], '"e1"'));
    const store = new RemoteConversationStore(URL_);
    await store.listThreads();
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    const stop = store.watchThreads(() => undefined, "stream");
    await vi.advanceTimersByTimeAsync(0);
    stop();
    const headers = fetchMock.mock.calls.at(-1)?.[1]?.headers as Record<string, string>;
    expect(headers["Accept"]).toBe("text/event-stream");
    expect(headers).not.toHaveProperty("Last-Event-ID");
  });

  it("hands on nothing for a failed poll, and the list once it answers", async () => {
    const store = new RemoteConversationStore(URL_);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    fetchMock.mockResolvedValue(list([row("t1", "2026-01-01T00:00:01+00:00", null)], '"e1"'));
    const got: string[][] = [];
    const stop = store.watchThreads((t) => got.push(t.map((m) => m.threadId)), "poll");
    await vi.advanceTimersByTimeAsync(0);
    expect(got).toEqual([]);
    await vi.advanceTimersByTimeAsync(5000);
    stop();
    expect(got).toEqual([["t1"]]);
  });

  it("hands on every list from a server that sends no ETag", async () => {
    const store = new RemoteConversationStore(URL_);
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ threads: [row("t1", "2026-01-01T00:00:01+00:00", null)] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const got: string[][] = [];
    const stop = store.watchThreads((t) => got.push(t.map((m) => m.threadId)), "poll");
    await vi.advanceTimersByTimeAsync(5000);
    stop();
    expect(got).toEqual([["t1"], ["t1"]]);
  });
});
