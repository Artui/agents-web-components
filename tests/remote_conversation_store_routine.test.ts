import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadMeta } from "../src/core/conversation_store.js";
import { RemoteConversationStore } from "../src/core/remote_conversation_store.js";
import recorded from "./fixtures/routines.json";

const fetchMock = vi.fn();

async function listed(body: unknown): Promise<Record<string, ThreadMeta>> {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  const metas = await new RemoteConversationStore("https://x/agent/threads/").listThreads();
  return Object.fromEntries(metas.map((meta) => [meta.threadId, meta]));
}

const row = (extra: Record<string, unknown>) => ({
  thread_id: "t",
  title: "T",
  updated_at: null,
  preview: "p",
  ...extra,
});

describe("RemoteConversationStore thread routine", () => {
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the routine off django-ag-ui 0.88.1's recorded rows, and none off a typed thread", async () => {
    const rows = await listed(recorded.answers.threads.body);
    expect(rows["fired"]?.routine).toEqual({ id: "1", name: "standup" });
    expect(rows["typed"]).not.toHaveProperty("routine");
  });

  it("parses a row without the key exactly as before", async () => {
    const rows = await listed({ threads: [row({})] });
    expect(rows["t"]).toEqual({ threadId: "t", title: "T", updatedAt: Number.NaN, preview: "p" });
  });

  it("ignores a routine without a string id and name, and keeps one beside the status keys", async () => {
    const odd = await listed({
      threads: [
        row({ thread_id: "a", routine: { id: 1, name: "x" } }),
        row({ thread_id: "b", routine: { id: "1" } }),
        row({ thread_id: "c", routine: "standup" }),
      ],
    });
    expect(Object.values(odd).filter((meta) => "routine" in meta)).toEqual([]);
    const both = await listed({
      threads: [row({ routine: { id: "2", name: "cleanup" }, status: "running" })],
    });
    expect(both["t"]).toMatchObject({ status: "running", routine: { id: "2", name: "cleanup" } });
  });
});
