import type { Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, OPEN_THREADS_EVENT, OPEN_THREADS_KEY } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import {
  type ClientConversationStore,
  SessionStorageStore,
  type ThreadMeta,
} from "../src/core/conversation_store.js";
import { defineChat } from "../src/core/define_chat.js";
import type { OpenThreadsDetail } from "../src/core/events/open_threads_detail.js";
import { OpenThreads } from "../src/core/open_threads.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

defineChat();

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}

function turn(id: string, content: string): Message {
  return { id, role: "user", content } as Message;
}

function mount(attributes: Record<string, string> = {}): {
  el: AgUiChat;
  seen: OpenThreadsDetail[];
} {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  el.agentFactory = () =>
    makeFakeAgent({
      script: async (emit: Emit) => {
        emit.runStart();
        emit.textEnd("answer");
        emit.runEnd();
      },
    }).agent;
  const seen: OpenThreadsDetail[] = [];
  el.addEventListener(OPEN_THREADS_EVENT, (event) => {
    seen.push((event as CustomEvent<OpenThreadsDetail>).detail);
  });
  document.body.appendChild(el);
  return { el, seen };
}

function ids(el: AgUiChat): string[] {
  return el.tabs.map((tab) => tab.threadId);
}

beforeEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  sessionStorage.clear();
});

describe("OpenThreads", () => {
  function model(stored: string | null = null): { tabs: OpenThreads; written: string[] } {
    const written: string[] = [];
    const tabs = new OpenThreads({ read: () => stored, write: (value) => written.push(value) });
    tabs.load();
    return { tabs, written };
  }

  it("starts empty when nothing or something malformed is stored", () => {
    expect(model().tabs.tabs).toEqual([]);
    expect(model("{not json").tabs.tabs).toEqual([]);
    expect(model('{"threadId":"a"}').tabs.tabs).toEqual([]);
  });

  it("keeps only well-formed, distinct entries from storage", () => {
    const stored = JSON.stringify([
      { threadId: "a", title: "A" },
      null,
      "b",
      { threadId: "", title: "empty" },
      { threadId: 3, title: "number" },
      { threadId: "c", title: 4 },
      { threadId: "a", title: "again" },
      { threadId: "d", title: "D" },
    ]);
    expect(model(stored).tabs.tabs).toEqual([
      { threadId: "a", title: "A" },
      { threadId: "d", title: "D" },
    ]);
  });

  it("opens in order, once, and writes each change", () => {
    const { tabs, written } = model();
    expect(tabs.open("a", "A")).toBe(true);
    expect(tabs.open("b", "")).toBe(true);
    expect(tabs.open("a", "other")).toBe(false);
    expect(tabs.tabs).toEqual([
      { threadId: "a", title: "A" },
      { threadId: "b", title: "" },
    ]);
    expect(tabs.has("b")).toBe(true);
    expect(tabs.has("z")).toBe(false);
    expect(written).toHaveLength(2);
    expect(JSON.parse(written[1] as string)).toEqual(tabs.tabs);
  });

  it("hands out a frozen snapshot the caller cannot change", () => {
    const { tabs } = model();
    tabs.open("a", "A");
    const snapshot = tabs.tabs;
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0])).toBe(true);
    tabs.open("b", "B");
    expect(snapshot).toHaveLength(1);
  });

  it("closes only what is open", () => {
    const { tabs, written } = model();
    tabs.open("a", "A");
    expect(tabs.close("z")).toBe(false);
    expect(tabs.close("a")).toBe(true);
    expect(tabs.tabs).toEqual([]);
    expect(written).toHaveLength(2);
  });

  it("retitles an open tab only when the title differs", () => {
    const { tabs, written } = model();
    tabs.open("a", "A");
    expect(tabs.retitle("z", "Z")).toBe(false);
    expect(tabs.retitle("a", "A")).toBe(false);
    expect(tabs.retitle("a", "Renamed")).toBe(true);
    expect(tabs.tabs).toEqual([{ threadId: "a", title: "Renamed" }]);
    expect(written).toHaveLength(2);
  });

  it("replaces a tab in place, or reports there was none", () => {
    const { tabs } = model();
    tabs.open("a", "A");
    tabs.open("b", "B");
    expect(tabs.replace("z", "y", "")).toBe(false);
    expect(tabs.replace("a", "n", "")).toBe(true);
    expect(tabs.tabs).toEqual([
      { threadId: "n", title: "" },
      { threadId: "b", title: "B" },
    ]);
  });

  it("names the neighbour a closed tab hands over to: right, else left, else none", () => {
    const { tabs } = model();
    expect(tabs.neighbour("a")).toBeNull();
    tabs.open("a", "A");
    expect(tabs.neighbour("a")).toBeNull();
    tabs.open("b", "B");
    tabs.open("c", "C");
    expect(tabs.neighbour("a")).toBe("b");
    expect(tabs.neighbour("b")).toBe("c");
    expect(tabs.neighbour("c")).toBe("b");
  });

  it("lists the tabs still waiting for a title", () => {
    const { tabs } = model();
    tabs.open("a", "");
    tabs.open("b", "B");
    tabs.open("c", "");
    expect(tabs.untitled("a")).toEqual(["c"]);
  });
});

describe("<ag-ui-chat> open threads", () => {
  it("is empty and inert before connecting", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    const seen: unknown[] = [];
    el.addEventListener(OPEN_THREADS_EVENT, (event) => seen.push(event));
    el.openTab("t1", "One");
    el.closeTab("t1");
    expect(el.tabs).toEqual([]);
    expect(seen).toEqual([]);
  });

  it("opens the thread on screen at connect, reported as a restore", async () => {
    const { el, seen } = mount();
    await flush();
    expect(ids(el)).toEqual([el.threadId]);
    expect(seen).toEqual([{ tabs: [{ threadId: el.threadId, title: "" }], reason: "restore" }]);
  });

  it("opens a tab behind the one on screen, once", async () => {
    const { el, seen } = mount();
    await flush();
    const active = el.threadId as string;
    seen.length = 0;

    el.openTab("t1", "One");
    el.openTab("t1", "Other");

    expect(el.threadId).toBe(active);
    expect(el.tabs).toEqual([
      { threadId: active, title: "" },
      { threadId: "t1", title: "One" },
    ]);
    expect(seen.map((detail) => detail.reason)).toEqual(["open"]);
  });

  it("titles a tab opened without one from the store's list", async () => {
    const { el, seen } = mount();
    await flush();
    el.conversationStore.saveMessages("t1", [turn("u1", "book a flight")]);
    seen.length = 0;

    el.openTab("t1");
    await flush();

    expect(el.tabs[1]).toEqual({ threadId: "t1", title: "book a flight" });
    expect(seen.map((detail) => detail.reason)).toEqual(["open", "title"]);
  });

  it("titles the active tab from the thread on screen", async () => {
    const { el, seen } = mount();
    await flush();
    seen.length = 0;

    el.openTab(el.threadId as string);
    await el.sendMessage("plan a trip");
    await flush();

    expect(el.tabs).toEqual([{ threadId: el.threadId, title: "plan a trip" }]);
    expect(seen.map((detail) => detail.reason)).toEqual(["title"]);
  });

  it("leaves a title alone when the store does not list the thread or cannot list", async () => {
    const { el } = mount();
    await flush();
    el.openTab("ghost");
    await flush();
    expect(el.tabs[1]).toEqual({ threadId: "ghost", title: "" });

    vi.spyOn(el.conversationStore, "listThreads").mockRejectedValue(new Error("offline"));
    el.openTab("ghost-2");
    await flush();
    expect(el.tabs[2]).toEqual({ threadId: "ghost-2", title: "" });
  });

  it("takes a title the store's watched list brings into a tab behind the screen", async () => {
    let hand: ((threads: readonly ThreadMeta[]) => void) | undefined;
    const inner = new SessionStorageStore("watched");
    // A host's store, so the element keeps it rather than scoping its own.
    const store: ClientConversationStore = {
      threadId: () => inner.threadId(),
      newThread: () => inner.newThread(),
      loadMessages: (id) => inner.loadMessages(id),
      saveMessages: (id, messages) => inner.saveMessages(id, messages),
      loadCheckpoint: (id) => inner.loadCheckpoint(id),
      saveCheckpoint: (id, checkpoint) => inner.saveCheckpoint(id, checkpoint),
      clear: (id) => inner.clear(id),
      listThreads: () => inner.listThreads(),
      setActiveThread: (id) => inner.setActiveThread(id),
      renameThread: (id, title) => inner.renameThread(id, title),
      watchThreads: (changed) => {
        hand = changed;
        return () => undefined;
      },
    };
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-thread-status", "poll");
    el.conversationStore = store;
    document.body.appendChild(el);
    await flush();
    el.openTab("t1", "first words");
    const seen: OpenThreadsDetail[] = [];
    el.addEventListener(OPEN_THREADS_EVENT, (event) => {
      seen.push((event as CustomEvent<OpenThreadsDetail>).detail);
    });

    hand?.([{ threadId: "t1", title: "Renamed", updatedAt: 1, preview: "" }]);

    expect(el.tabs[1]).toEqual({ threadId: "t1", title: "Renamed" });
    expect(seen.map((detail) => detail.reason)).toEqual(["title"]);
  });

  it("opens a thread switched to, and a new chat", async () => {
    const { el, seen } = mount();
    await flush();
    const first = el.threadId as string;
    await el.sendMessage("keep me");
    el.conversationStore.saveMessages("t1", [turn("u1", "hello t1")]);
    seen.length = 0;

    await el.switchThread("t1");
    await flush();
    el.newChat();
    await flush();

    expect(el.tabs).toEqual([
      { threadId: first, title: "keep me" },
      { threadId: "t1", title: "hello t1" },
      { threadId: el.threadId, title: "" },
    ]);
    expect(seen.map((detail) => detail.reason)).toEqual(["open", "open"]);
  });

  it("reuses the tab of a new chat nothing was sent in", async () => {
    const { el, seen } = mount();
    await flush();
    const untouched = el.threadId as string;
    seen.length = 0;

    el.newChat();
    await flush();

    expect(el.threadId).not.toBe(untouched);
    expect(el.tabs).toEqual([{ threadId: el.threadId, title: "" }]);
    expect(seen.map((detail) => detail.reason)).toEqual(["open"]);
  });

  it("closes a tab behind the screen and keeps its thread in history", async () => {
    const { el, seen } = mount();
    await flush();
    const active = el.threadId as string;
    el.conversationStore.saveMessages("t1", [turn("u1", "hello t1")]);
    el.openTab("t1", "hello t1");
    seen.length = 0;

    el.closeTab("t1");
    el.closeTab("unknown");

    expect(el.threadId).toBe(active);
    expect(ids(el)).toEqual([active]);
    expect(seen.map((detail) => detail.reason)).toEqual(["close"]);
    const listed = await el.conversationStore.listThreads();
    expect(listed.map((row) => row.threadId)).toContain("t1");
  });

  it("closing the tab on screen shows its right neighbour, else its left", async () => {
    const { el } = mount();
    await flush();
    await el.sendMessage("first");
    const first = el.threadId as string;
    el.conversationStore.saveMessages("t1", [turn("u1", "one")]);
    el.conversationStore.saveMessages("t2", [turn("u2", "two")]);
    el.openTab("t1", "one");
    el.openTab("t2", "two");

    el.closeTab(first);
    await flush();
    expect(el.threadId).toBe("t1");
    expect(ids(el)).toEqual(["t1", "t2"]);

    await el.switchThread("t2");
    el.closeTab("t2");
    await flush();
    expect(el.threadId).toBe("t1");
    expect(ids(el)).toEqual(["t1"]);
  });

  it("closing the last tab starts a new chat in a fresh tab", async () => {
    const { el } = mount();
    await flush();
    await el.sendMessage("only");
    const only = el.threadId as string;

    el.closeTab(only);
    await flush();

    expect(el.threadId).not.toBe(only);
    expect(ids(el)).toEqual([el.threadId]);
    const listed = await el.conversationStore.listThreads();
    expect(listed.map((row) => row.threadId)).toContain(only);
  });

  it("stays on the closed thread's screen when its neighbour cannot be loaded", async () => {
    const { el } = mount();
    await flush();
    await el.sendMessage("first");
    const first = el.threadId as string;
    el.openTab("t1", "one");
    vi.spyOn(el.conversationStore, "loadMessages").mockRejectedValue(new Error("gone"));

    el.closeTab(first);
    await flush();

    expect(el.threadId).toBe(first);
    expect(ids(el)).toEqual(["t1"]);

    el.openTab(first);
    expect(el.tabs[1]).toEqual({ threadId: first, title: "first" });
  });

  it("delete closes the tab and removes the thread; closing keeps it", async () => {
    const { el, seen } = mount();
    await flush();
    el.conversationStore.saveMessages("t1", [turn("u1", "one")]);
    el.openTab("t1", "one");
    seen.length = 0;

    el.deleteThread("t1");
    await flush();

    expect(ids(el)).toEqual([el.threadId]);
    expect(seen.map((detail) => detail.reason)).toEqual(["delete"]);
    const listed = await el.conversationStore.listThreads();
    expect(listed.map((row) => row.threadId)).not.toContain("t1");
  });

  it("deleting the thread on screen closes its tab and opens the fresh one", async () => {
    const { el, seen } = mount();
    await flush();
    await el.sendMessage("doomed");
    const doomed = el.threadId as string;
    seen.length = 0;

    el.deleteThread(doomed);
    await flush();

    expect(el.threadId).not.toBe(doomed);
    expect(ids(el)).toEqual([el.threadId]);
    expect(seen.map((detail) => detail.reason)).toEqual(["delete", "open"]);
  });

  it("deleting a thread with no tab says nothing about tabs", async () => {
    const { el, seen } = mount();
    await flush();
    el.conversationStore.saveMessages("t1", [turn("u1", "one")]);
    seen.length = 0;

    el.deleteThread("t1");

    expect(seen).toEqual([]);
  });

  it("survives a reload of the page, under the element's own key", async () => {
    const { el } = mount({ id: "chat-a" });
    await flush();
    await el.sendMessage("persisted");
    el.openTab("t1", "one");
    const before = el.tabs;
    el.remove();

    const again = mount({ id: "chat-a" });
    await flush();

    expect(again.el.tabs).toEqual(before);
    expect(again.seen).toEqual([{ tabs: before, reason: "restore" }]);
    expect(sessionStorage.getItem(`${OPEN_THREADS_KEY}@chat-a`)).not.toBeNull();
  });

  it("keeps the tabs under the root key for an element with nothing to key on", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    document.body.appendChild(el);
    await flush();

    el.openTab("t1", "One");

    expect(JSON.parse(sessionStorage.getItem(OPEN_THREADS_KEY) ?? "[]")).toEqual(el.tabs);
  });

  it("keeps two elements' tabs apart", async () => {
    const a = mount({ id: "chat-a", endpoint: "/a/" });
    const b = mount({ id: "chat-b", endpoint: "/b/" });
    await flush();

    a.el.openTab("only-a", "A");

    expect(ids(b.el)).toEqual([b.el.threadId]);
  });

  it("drops the previous principal's tabs on a user-key handover", async () => {
    const { el, seen } = mount({ id: "c", "user-key": "alice" });
    await flush();
    el.openTab("secret", "Alice's plans");
    seen.length = 0;

    el.setAttribute("user-key", "bob");
    await flush();

    expect(ids(el)).toEqual([el.threadId]);
    expect(JSON.stringify(el.tabs)).not.toContain("Alice");
    expect(seen.at(-1)?.reason).toBe("rescope");
    expect(sessionStorage.getItem(`${OPEN_THREADS_KEY}@c#alice`)).toBeNull();
  });

  it("drops them too when the handover happened while detached", async () => {
    const { el } = mount({ id: "c", "user-key": "alice" });
    await flush();
    el.openTab("secret", "Alice's plans");
    el.remove();
    el.setAttribute("user-key", "bob");

    document.body.appendChild(el);
    await flush();

    expect(ids(el)).toEqual([el.threadId]);
  });

  it("keeps the tabs when a user-key first names the user already there", async () => {
    const { el } = mount();
    await flush();
    el.openTab("mine", "Mine");

    el.setAttribute("user-key", "alice");
    await flush();
    expect(ids(el)).toContain("mine");

    el.remove();
    document.body.appendChild(el);
    await flush();
    expect(ids(el)).toContain("mine");
  });

  it("an adoption moves the tabs on screen over any stray stored for the principal", async () => {
    sessionStorage.setItem(
      `${OPEN_THREADS_KEY}@c#alice`,
      JSON.stringify([{ threadId: "stray", title: "Stray" }]),
    );
    const { el } = mount({ id: "c" });
    await flush();
    el.openTab("mine", "Mine");
    const before = el.tabs;

    el.setAttribute("user-key", "alice");
    el.remove();
    document.body.appendChild(el);
    await flush();

    expect(el.tabs).toEqual(before);
    expect(sessionStorage.getItem(`${OPEN_THREADS_KEY}@c`)).toBeNull();
  });
});
