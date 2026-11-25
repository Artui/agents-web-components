import type { HttpAgent } from "@ag-ui/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpAgent } from "../src/core/create_http_agent.js";
import { DetachedRuns } from "../src/core/detached_runs.js";
import { RemoteConversationStore } from "../src/core/remote_conversation_store.js";
import { RunIndex } from "../src/core/run_index.js";
import recorded from "./fixtures/thread_status.json";

const THREADS = "/agent/threads/";

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function unauthorized(): Response {
  return new Response(JSON.stringify({ detail: "expired" }), { status: 401 });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ETag: '"e-1"' },
  });
}

function rotating(): () => Record<string, string> {
  let issued = 0;
  return () => {
    issued += 1;
    return { Authorization: `Bearer t${issued}` };
  };
}

function tokens(): (string | null)[] {
  return fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get("Authorization"));
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("RemoteConversationStore retrying a 401", () => {
  function store(retry: boolean): RemoteConversationStore {
    return new RemoteConversationStore(
      THREADS,
      rotating(),
      undefined,
      () => undefined,
      true,
      () => retry,
    );
  }

  it("lists again with headers read afresh when opted in", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(json({ threads: [] }));

    expect(await store(true).listThreads()).toEqual([]);

    expect(tokens()).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("sends one listing and falls back as today without the opt-in", async () => {
    fetchMock.mockResolvedValue(unauthorized());

    await store(false).listThreads();

    expect(tokens()).toEqual(["Bearer t1"]);
  });

  it("retries once: a second 401 is the answer", async () => {
    fetchMock.mockResolvedValue(unauthorized());

    await store(true).listThreads();

    expect(tokens()).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("retries a rename and a delete, each with its body and method", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(json({}));
    const remote = store(true);
    remote.renameThread("t-a", "Named");
    await flush();
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(json({}));
    remote.clear("t-b");
    await flush();

    const sent = fetchMock.mock.calls.map(([url, init]) => [url, init?.method, init?.body]);
    expect(sent).toEqual([
      [`${THREADS}t-a/`, "PATCH", '{"title":"Named"}'],
      [`${THREADS}t-a/`, "PATCH", '{"title":"Named"}'],
      [`${THREADS}t-b/`, "DELETE", null],
      [`${THREADS}t-b/`, "DELETE", null],
    ]);
    expect(tokens()).toEqual(["Bearer t1", "Bearer t2", "Bearer t3", "Bearer t4"]);
  });

  it("sends a rename, a delete and a read mark once without the opt-in", async () => {
    const row = recorded.firstTurnRowAfterRunAway;
    fetchMock.mockResolvedValueOnce(json({ threads: [row] }));
    const remote = store(false);
    await remote.listThreads();
    fetchMock.mockResolvedValue(unauthorized());
    remote.renameThread("t-first", "Named");
    remote.markRead("t-first");
    remote.clear("t-first");
    await flush();

    expect(fetchMock.mock.calls.slice(1).map(([, init]) => init?.method)).toEqual([
      "PATCH",
      "POST",
      "DELETE",
    ]);
  });

  it.each([403, 404, 500])("never repeats a listing answered %i", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));

    await store(true).listThreads();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops the refused answer's body before the retry", async () => {
    const refused = unauthorized();
    const cancel = vi.spyOn(refused.body as ReadableStream<Uint8Array>, "cancel");
    fetchMock.mockResolvedValueOnce(refused).mockResolvedValueOnce(json({ threads: [] }));

    await store(true).listThreads();

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("retries a read mark", async () => {
    const row = recorded.firstTurnRowAfterRunAway;
    fetchMock.mockResolvedValueOnce(json({ threads: [row] }));
    const remote = store(true);
    await remote.listThreads();
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    remote.markRead("t-first");
    await flush();

    const reads = fetchMock.mock.calls.filter(([url]) => url === `${THREADS}t-first/read/`);
    expect(reads.map(([, init]) => new Headers(init?.headers).get("Authorization"))).toEqual([
      "Bearer t2",
      "Bearer t3",
    ]);
  });

  it("follows the stream again on the same signal after a 401", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValue(json({ threads: [] }));
    const stop = store(true).watchThreads(() => undefined, "stream");
    await vi.advanceTimersByTimeAsync(0);
    stop();

    const [first, second] = fetchMock.mock.calls.map(([, init]) => init);
    expect(tokens().slice(0, 2)).toEqual(["Bearer t1", "Bearer t2"]);
    expect(new Headers(second?.headers).get("Accept")).toBe("text/event-stream");
    expect(second?.signal).toBe(first?.signal);
  });

  it("follows the stream once a turn without the opt-in", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(unauthorized());
    const stop = store(false).watchThreads(() => undefined, "stream");
    await vi.advanceTimersByTimeAsync(0);
    stop();

    expect(tokens()).toEqual(["Bearer t1"]);
  });
});

describe("RunIndex retrying a 401", () => {
  it("lists again when opted in, and once without", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(json({ runs: [] }));
    await new RunIndex(
      "/agent/runs/",
      rotating(),
      () => undefined,
      () => true,
    ).list();
    expect(tokens()).toEqual(["Bearer t1", "Bearer t2"]);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(unauthorized());
    expect(await new RunIndex("/agent/runs/", rotating()).list()).toEqual([]);
    expect(tokens()).toEqual(["Bearer t1"]);
  });
});

describe("DetachedRuns retrying a 401", () => {
  it("probes once without the opt-in", async () => {
    fetchMock.mockResolvedValue(unauthorized());
    expect(await new DetachedRuns(THREADS, rotating(), () => undefined).probe("t1")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("probes again when opted in, and never posts a cancel twice", async () => {
    const runs = new DetachedRuns(
      THREADS,
      rotating(),
      () => undefined,
      () => true,
    );
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(json({ run_id: "r1", status: "running" }));
    expect(await runs.probe("t1")).toEqual({ runId: "r1", status: "running" });
    expect(tokens()).toEqual(["Bearer t1", "Bearer t2"]);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(unauthorized());
    await runs.cancel("t1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createHttpAgent retrying a 401", () => {
  function wrapped(retry: boolean): HttpAgent["fetch"] {
    const agent = createHttpAgent({
      endpoint: "/agent/",
      getHeaders: rotating(),
      retryUnauthorized: () => retry,
    }) as HttpAgent;
    return agent.fetch;
  }

  it("asks the run log again when opted in", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(json({}));

    const response = await wrapped(true)(`${THREADS}t1/events/`, { method: "GET" });

    expect(response.status).toBe(200);
    expect(tokens()).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("sends the run POST once, opted in or not, and hands back the 401", async () => {
    fetchMock.mockResolvedValue(unauthorized());

    const response = await wrapped(true)("/agent/", { method: "POST", body: "{}" });

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks once without the opt-in", async () => {
    fetchMock.mockResolvedValue(unauthorized());

    const response = await wrapped(false)(`${THREADS}t1/events/`, { method: "GET" });

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
