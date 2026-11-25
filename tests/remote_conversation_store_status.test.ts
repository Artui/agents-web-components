import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadMeta } from "../src/core/conversation_store.js";
import { RemoteConversationStore } from "../src/core/remote_conversation_store.js";
import recorded from "./fixtures/thread_status.json";

const fetchMock = vi.fn();
const URL_ = "https://x/agent/threads/";

type Row = Record<string, unknown>;

function list(rows: readonly (Row | null)[], etag = '"e-1"'): Response {
  return new Response(JSON.stringify({ threads: rows.filter((row) => row !== null) }), {
    status: 200,
    headers: { "content-type": "application/json", ETag: etag },
  });
}

function recordedList(answer: { status: number; etag: string | null; body: unknown }): Response {
  return new Response(answer.status === 304 ? null : JSON.stringify(answer.body), {
    status: answer.status,
    headers: answer.etag === null ? {} : { ETag: answer.etag },
  });
}

function stream(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
}

function byId(metas: readonly ThreadMeta[]): Record<string, ThreadMeta> {
  return Object.fromEntries(metas.map((meta) => [meta.threadId, meta]));
}

describe("RemoteConversationStore thread status", () => {
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("leaves out the reason of a failed run the server gives none", async () => {
    fetchMock.mockResolvedValueOnce(
      list([
        {
          thread_id: "t-failed",
          title: "Failed",
          updated_at: "2026-01-01T00:00:02+00:00",
          preview: "",
          status: "failed",
          reason: null,
          last_read_at: null,
        },
      ]),
    );
    const rows = byId(await new RemoteConversationStore(URL_).listThreads());

    expect(rows["t-failed"]?.status).toBe("failed");
    expect(rows["t-failed"]).not.toHaveProperty("reason");
  });

  it("reads status, reason and the interrupt list off the recorded rows", async () => {
    fetchMock.mockResolvedValueOnce(recordedList(recorded.listed));
    const rows = byId(await new RemoteConversationStore(URL_).listThreads());

    expect(rows["t-failed"]?.status).toBe("failed");
    expect(rows["t-failed"]?.reason).toBe("error");
    expect(rows["t-read"]?.status).toBe("idle");
    expect(rows["t-read"]).not.toHaveProperty("reason");
    expect(rows["t-read"]).not.toHaveProperty("interrupts");
    expect(rows["t-approve"]?.status).toBe("waiting");
    expect(rows["t-approve"]?.interrupts).toEqual([
      {
        id: "int-call-1",
        reason: "tool_call",
        message: "delete_invoice",
        toolCallId: "call-1",
        metadata: { destructive: true, kind: "approval" },
      },
    ]);
    expect(rows["t-question"]?.interrupts?.[0]?.metadata).toEqual({
      destructive: false,
      kind: "question",
    });
  });

  it("reads a thread unread when it changed after it was last read", async () => {
    fetchMock.mockResolvedValueOnce(
      list([recorded.rowAfterRunAway, { ...recorded.rowAfterRead, thread_id: "t-seen" }]),
    );
    const rows = byId(await new RemoteConversationStore(URL_).listThreads());

    expect(rows["t-read"]?.unread).toBe(true);
    expect(rows["t-seen"]?.unread).toBe(false);
  });

  it("reads a thread never read as unread, but not one still running", async () => {
    const running = { ...recorded.rowWhileRunning, last_read_at: null };
    fetchMock.mockResolvedValueOnce(list([recorded.firstTurnRowAfterRunAway, running]));
    const rows = byId(await new RemoteConversationStore(URL_).listThreads());

    expect(rows["t-first"]?.unread).toBe(true);
    expect(rows["t-read"]?.unread).toBe(false);
  });

  it("reads a status row that carries no read mark key at all as not unread", async () => {
    const { last_read_at: _mark, ...unmarked } = recorded.firstTurnRowAfterRunAway;
    fetchMock.mockResolvedValueOnce(list([unmarked]));

    expect((await new RemoteConversationStore(URL_).listThreads())[0]?.unread).toBe(false);
  });

  it.each([
    { when: "with a date", updated_at: "2026-01-01T00:00:03+00:00" },
    { when: "without a date", updated_at: null },
  ])("reads a never-read thread read here as read, $when", async ({ updated_at }) => {
    const row = { ...recorded.firstTurnRowAfterRunAway, updated_at };
    fetchMock
      .mockResolvedValueOnce(list([row]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(list([row], '"e-2"'));
    const store = new RemoteConversationStore(URL_);
    expect((await store.listThreads())[0]?.unread).toBe(true);
    store.markRead("t-first");
    await flush();

    expect((await store.listThreads())[0]?.unread).toBe(false);
  });

  it("adds no status keys for a server without a run store", async () => {
    fetchMock.mockResolvedValueOnce(
      list([{ thread_id: "t1", title: "A", updated_at: null, preview: "" }]),
    );
    const [row] = await new RemoteConversationStore(URL_).listThreads();

    expect(row).toEqual({ threadId: "t1", title: "A", updatedAt: Number.NaN, preview: "" });
  });

  it("asks again with the ETag and reuses the rows a 304 confirms", async () => {
    fetchMock
      .mockResolvedValueOnce(recordedList(recorded.listed))
      .mockResolvedValueOnce(recordedList(recorded.notModified));
    const store = new RemoteConversationStore(URL_, () => ({ "X-CSRF": "tok" }));
    const first = await store.listThreads();
    const second = await store.listThreads();

    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      headers: { "X-CSRF": "tok", "If-None-Match": recorded.listed.etag },
    });
    expect(second).toEqual(first);
  });

  it("keeps a deletion made here over the rows a 304 confirms", async () => {
    fetchMock
      .mockResolvedValueOnce(recordedList(recorded.listed))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(recordedList(recorded.notModified));
    const store = new RemoteConversationStore(URL_);
    await store.listThreads();
    store.clear("t-failed");
    const rows = byId(await store.listThreads());

    expect(rows).not.toHaveProperty("t-failed");
  });

  it("posts a read to the thread's read route once the server lists status", async () => {
    fetchMock
      .mockResolvedValueOnce(recordedList(recorded.listed))
      .mockResolvedValueOnce(new Response(null, { status: recorded.markRead.status }));
    const store = new RemoteConversationStore(URL_, () => ({ "X-CSRF": "tok" }));
    await store.listThreads();
    store.markRead("t-read");
    await flush();

    expect(fetchMock).toHaveBeenLastCalledWith(`${URL_}t-read/read/`, {
      method: "POST",
      headers: { "X-CSRF": "tok" },
      body: null,
    });
  });

  it("posts no read to a server without a run store, which has no read route", async () => {
    fetchMock.mockResolvedValueOnce(
      list([{ thread_id: "t1", title: "A", updated_at: null, preview: "" }]),
    );
    const store = new RemoteConversationStore(URL_);
    await store.listThreads();
    store.markRead("t1");
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads a thread read here as read until it changes again", async () => {
    fetchMock
      .mockResolvedValueOnce(list([recorded.rowAfterRunAway]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(list([recorded.rowAfterRunAway], '"e-2"'))
      .mockResolvedValueOnce(
        list([{ ...recorded.rowAfterRunAway, updated_at: "2026-01-01T00:09:00+00:00" }], '"e-3"'),
      );
    const store = new RemoteConversationStore(URL_);
    await store.listThreads();
    store.markRead("t-read");
    await flush();

    expect((await store.listThreads())[0]?.unread).toBe(false);
    expect((await store.listThreads())[0]?.unread).toBe(true);
  });

  it("polls with the ETag and hands on only a changed list", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(recordedList(recorded.listed))
      .mockResolvedValueOnce(recordedList(recorded.notModified))
      .mockResolvedValueOnce(recordedList(recorded.listedAfterResume));
    const listener = vi.fn();
    const stop = new RemoteConversationStore(URL_).watchThreads(listener, "poll");
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(listener).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(byId(listener.mock.calls[1]?.[0])["t-approve"]?.status).toBe("idle");

    stop();
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("follows the stream's frames, skipping heartbeats", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(
      stream([
        ": django-ag-ui heartbeat\n\n",
        recorded.streamFrame.slice(0, 40),
        recorded.streamFrame.slice(40),
      ]),
    );
    fetchMock.mockReturnValue(new Promise(() => undefined));
    const listener = vi.fn();
    const stop = new RemoteConversationStore(URL_, () => ({ "X-CSRF": "tok" })).watchThreads(
      listener,
      "stream",
    );
    await vi.advanceTimersByTimeAsync(0);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_);
    expect(init.headers).toEqual({ "X-CSRF": "tok", Accept: "text/event-stream" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(byId(listener.mock.calls[0]?.[0])["t-approve"]?.status).toBe("idle");
    stop();
  });

  it("reconnects when the stream ends, naming the last frame it saw", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(stream([recorded.streamFrame]))
      .mockReturnValue(new Promise(() => undefined));
    const listener = vi.fn();
    const stop = new RemoteConversationStore(URL_).watchThreads(listener, "stream");
    await vi.advanceTimersByTimeAsync(5000);

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.headers).toEqual({
      Accept: "text/event-stream",
      "Last-Event-ID": recorded.streamFrame.split("\n")[0]?.slice(4),
    });
    stop();
  });

  it("reads a poll answer to a stream request, then polls", async () => {
    vi.useFakeTimers();
    const wsgi = recorded.wsgiStreamRequest;
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(wsgi.body), {
          status: wsgi.status,
          headers: { "content-type": wsgi.contentType, ETag: wsgi.etag },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { ETag: wsgi.etag } }));
    const listener = vi.fn();
    const stop = new RemoteConversationStore(URL_).watchThreads(listener, "stream");
    await vi.advanceTimersByTimeAsync(5000);

    expect(listener).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.headers).toEqual({ "If-None-Match": wsgi.etag });
    stop();
  });

  it("stops a stream it is reading", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError")));
      });
    });
    const stop = new RemoteConversationStore(URL_).watchThreads(vi.fn(), "stream");
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(20000);

    expect(signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hands on nothing from a poll answered after it was stopped", async () => {
    vi.useFakeTimers();
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const listener = vi.fn();
    const stop = new RemoteConversationStore(URL_).watchThreads(listener, "poll");
    await vi.advanceTimersByTimeAsync(0);
    stop();
    answer(recordedList(recorded.listed));
    await vi.advanceTimersByTimeAsync(20000);

    expect(listener).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a refused stream", () => new Response(null, { status: 500 })],
    [
      "a refusal with django-ag-ui's error body",
      () =>
        new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    ],
    ["an empty stream", () => new Response(null, { status: 200 })],
    ["a dropped connection", () => Promise.reject(new TypeError("network"))],
  ])("asks again after %s", async (_name, answer) => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(answer).mockReturnValue(new Promise(() => undefined));
    const listener = vi.fn();
    const stop = new RemoteConversationStore(URL_).watchThreads(listener, "stream");
    await vi.advanceTimersByTimeAsync(5000);

    expect(listener).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    stop();
  });

  it("reads a list with no threads, from a frame or an untyped answer, as empty", async () => {
    vi.useFakeTimers();
    const untyped = new Response(new Blob(["{}"]).stream(), { status: 200 });
    fetchMock
      .mockResolvedValueOnce(stream(['id: "e-9"\ndata: {}\n\n']))
      .mockResolvedValueOnce(untyped)
      .mockReturnValue(new Promise(() => undefined));
    const listener = vi.fn();
    const stop = new RemoteConversationStore(URL_).watchThreads(listener, "stream");
    await vi.advanceTimersByTimeAsync(5000);

    expect(untyped.headers.get("content-type")).toBeNull();
    expect(listener.mock.calls).toEqual([[[]], [[]]]);
    stop();
  });

  it("names the interrupts a thread waits on, asking again with the ETag", async () => {
    fetchMock
      .mockResolvedValueOnce(recordedList(recorded.listed))
      .mockResolvedValueOnce(recordedList(recorded.notModified))
      .mockResolvedValueOnce(recordedList(recorded.listedAfterResume));
    const store = new RemoteConversationStore(URL_);
    const first = await store.waitingInterrupts("t-approve");
    const again = await store.waitingInterrupts("t-approve");
    const answered = await store.waitingInterrupts("t-approve");

    expect(first.map((interrupt) => interrupt.id)).toEqual(["int-call-1"]);
    expect(again).toEqual(first);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      headers: { "If-None-Match": recorded.listed.etag },
    });
    expect(answered).toEqual([]);
  });

  it("names none for a thread not waiting, not listed, or not listable", async () => {
    fetchMock
      .mockResolvedValueOnce(recordedList(recorded.listed))
      .mockResolvedValueOnce(recordedList(recorded.listed))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));

    expect(await new RemoteConversationStore(URL_).waitingInterrupts("t-read")).toEqual([]);
    expect(await new RemoteConversationStore(URL_).waitingInterrupts("t-gone")).toEqual([]);
    expect(await new RemoteConversationStore(URL_).waitingInterrupts("t-read")).toEqual([]);
  });

  it("does not ask a server whose listing carried no status", async () => {
    fetchMock.mockResolvedValueOnce(
      list([{ thread_id: "t1", title: "A", updated_at: null, preview: "" }]),
    );
    const store = new RemoteConversationStore(URL_);
    await store.listThreads();

    expect(await store.waitingInterrupts("t1")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
