/**
 * A child thread's parent, read off the thread index.
 *
 * The rows are django-ag-ui 0.86.0's own: `_meta_to_json` over three
 * `ConversationMeta`s, a child in a scoped store, a child in an unscoped one
 * and their parent, captured into `fixtures/thread_parent.json`. None carries
 * a status key, which is a mount without a run store, so the parent has to be
 * read on the path that returns before the status keys.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadMeta } from "../src/core/conversation_store.js";
import { RemoteConversationStore } from "../src/core/remote_conversation_store.js";
import recorded from "./fixtures/thread_parent.json";

const fetchMock = vi.fn();
const URL_ = "https://x/agent/threads/";

function list(rows: readonly unknown[]): Response {
  return new Response(JSON.stringify({ threads: rows }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function listed(rows: readonly unknown[]): Promise<Record<string, ThreadMeta>> {
  fetchMock.mockResolvedValueOnce(list(rows));
  const metas = await new RemoteConversationStore(URL_).listThreads();
  return Object.fromEntries(metas.map((meta) => [meta.threadId, meta]));
}

function row(parent: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { thread_id: "c", title: "C", updated_at: null, preview: "", parent, ...extra };
}

describe("RemoteConversationStore thread parent", () => {
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the parent and its scope off the recorded rows", async () => {
    const rows = await listed(recorded);
    expect(rows["child-thread-1"]?.parent).toEqual({
      threadId: "parent-thread",
      scope: "assistant",
    });
    expect(rows["child-thread-2"]?.parent).toEqual({ threadId: "parent-thread", scope: null });
    expect(rows["parent-thread"]).not.toHaveProperty("parent");
  });

  it("keeps the parent beside the status keys", async () => {
    const rows = await listed([
      row({ thread_id: "p", scope: "assistant" }, { status: "waiting", interrupts: [] }),
    ]);
    expect(rows["c"]?.status).toBe("waiting");
    expect(rows["c"]?.parent).toEqual({ threadId: "p", scope: "assistant" });
  });

  it("lists a row whose parent is malformed as top-level", async () => {
    for (const parent of [undefined, "p", 7, {}, { thread_id: 7 }, { thread_id: "" }]) {
      const rows = await listed([row(parent)]);
      expect(rows["c"]).toBeDefined();
      expect(rows["c"]).not.toHaveProperty("parent");
    }
  });

  it("reads a scope that is not a string as unscoped", async () => {
    for (const scope of [undefined, 7, { id: "x" }]) {
      const rows = await listed([row({ thread_id: "p", scope })]);
      expect(rows["c"]?.parent).toEqual({ threadId: "p", scope: null });
    }
  });
});
