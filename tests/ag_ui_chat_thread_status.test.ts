import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, THREADS_CHANGE_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  ThreadMeta,
  ThreadsTransport,
} from "../src/core/conversation_store.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import { defineChat } from "../src/core/define_chat.js";
import type { ThreadsChangeDetail } from "../src/core/events/threads_change_detail.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

defineChat();

type Listener = (threads: readonly ThreadMeta[]) => void;

interface Watched {
  readonly store: ClientConversationStore;
  readonly started: ThreadsTransport[];
  readonly stops: ReturnType<typeof vi.fn>[];
  readonly hand: (threads: readonly ThreadMeta[]) => void;
}

function watchedStore(): Watched {
  const inner = new SessionStorageStore("watched");
  const store: ClientConversationStore = {
    threadId: () => inner.threadId(),
    newThread: () => inner.newThread(),
    loadMessages: (id) => inner.loadMessages(id),
    saveMessages: (id, messages) => inner.saveMessages(id, messages),
    loadCheckpoint: (id) => inner.loadCheckpoint(id),
    saveCheckpoint: (id, checkpoint) => inner.saveCheckpoint(id, checkpoint),
    clear: (id) => inner.clear(id),
    listThreads: () => Promise.resolve([]),
    setActiveThread: (id) => inner.setActiveThread(id),
    renameThread: (id, title) => inner.renameThread(id, title),
  };
  const started: ThreadsTransport[] = [];
  const stops: ReturnType<typeof vi.fn>[] = [];
  let listener: Listener = () => undefined;
  store.watchThreads = (next, transport) => {
    listener = next;
    started.push(transport);
    const stop = vi.fn();
    stops.push(stop);
    return stop;
  };
  return { store, started, stops, hand: (threads) => listener(threads) };
}

function mount(store: ClientConversationStore, status: string | null): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  if (status !== null) {
    el.setAttribute("data-thread-status", status);
  }
  el.conversationStore = store;
  document.body.appendChild(el);
  return el;
}

const waiting: ThreadMeta = {
  threadId: "t-away",
  title: "Away",
  updatedAt: 2,
  preview: "",
  status: "waiting",
  unread: true,
};

describe("<ag-ui-chat> data-thread-status", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("watches its store while connected, by the transport the attribute names", () => {
    const watched = watchedStore();
    const el = mount(watched.store, "stream");

    expect(watched.started).toEqual(["stream"]);
    el.remove();
    expect(watched.stops[0]).toHaveBeenCalledTimes(1);
  });

  it("hands on each list it receives and counts the threads it lists unread", () => {
    const watched = watchedStore();
    const el = mount(watched.store, "poll");
    const seen: ThreadsChangeDetail[] = [];
    el.addEventListener(THREADS_CHANGE_EVENT, (event) => {
      seen.push((event as CustomEvent<ThreadsChangeDetail>).detail);
    });
    watched.hand([waiting]);

    expect(seen).toEqual([{ threads: [waiting] }]);
    expect(el.unread).toBe(1);
  });

  it("watches nothing without the attribute, or with a value it does not know", () => {
    const watched = watchedStore();
    mount(watched.store, null);
    mount(watched.store, "push");

    expect(watched.started).toEqual([]);
  });

  it("follows the attribute as it changes", () => {
    const watched = watchedStore();
    const el = mount(watched.store, "poll");
    el.setAttribute("data-thread-status", "stream");
    expect(watched.started).toEqual(["poll", "stream"]);
    expect(watched.stops[0]).toHaveBeenCalledTimes(1);

    el.removeAttribute("data-thread-status");
    expect(watched.stops[1]).toHaveBeenCalledTimes(1);
    expect(watched.started).toHaveLength(2);
  });

  it("starts no watch from an attribute set while detached", () => {
    const watched = watchedStore();
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.conversationStore = watched.store;
    el.setAttribute("data-thread-status", "poll");

    expect(watched.started).toEqual([]);
  });

  it("watches nothing on a store that cannot", () => {
    const el = mount(new SessionStorageStore("plain"), "poll");

    expect(() => el.setAttribute("data-thread-status", "stream")).not.toThrow();
  });

  it("watches the server's list when data-threads-url is set", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    try {
      const el = document.createElement(ELEMENT_TAG) as AgUiChat;
      el.setAttribute("endpoint", "/agent/");
      el.setAttribute("data-threads-url", "/agent/threads/");
      el.setAttribute("data-thread-status", "stream");
      document.body.appendChild(el);
      await vi.advanceTimersByTimeAsync(0);

      const streamed = fetchMock.mock.calls.filter((call: unknown[]) => {
        const init = call[1] as RequestInit | undefined;
        return (
          (init?.headers as Record<string, string> | undefined)?.["Accept"] === "text/event-stream"
        );
      });
      expect(streamed.map((call: unknown[]) => call[0])).toEqual(["/agent/threads/"]);
      el.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads an answer watched in view once its run has settled, after the save", async () => {
    const order: string[] = [];
    const watched = watchedStore();
    watched.store.markRead = () => order.push("read");
    const el = mount(watched.store, null);
    el.setAttribute("data-start-open", "");
    el.setCollapsed(false);
    el.agentFactory = () =>
      makeFakeAgent({
        script: (emit) => {
          emit.runStart();
          emit.textEnd("an answer");
          order.push("run end");
          emit.runEnd();
        },
      }).agent;

    await el.sendMessage("hi");
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }

    expect(order).toEqual(["run end", "read"]);
  });

  it("reads an answer seen landing though the panel closed before its run settled", async () => {
    const order: string[] = [];
    const watched = watchedStore();
    watched.store.markRead = () => order.push("read");
    const el = mount(watched.store, null);
    el.setCollapsed(false);
    el.agentFactory = () =>
      makeFakeAgent({
        script: (emit) => {
          emit.runStart();
          emit.textEnd("an answer");
          el.setCollapsed(true);
          emit.runEnd();
        },
      }).agent;

    await el.sendMessage("hi");
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }

    expect(order).toEqual(["read"]);
  });
});
