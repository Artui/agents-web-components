/**
 * `<ag-ui-threads>` over a real `<ag-ui-chat>`: the list it draws from the
 * chat's store, the thread it marks, the chat it drives, and the run marks it
 * draws from what the store reports.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ELEMENT_TAG,
  THREADS_CHANGE_EVENT,
  THREADS_SELECT_EVENT,
  THREADS_TAG,
} from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type { ClientConversationStore } from "../src/core/conversation_store.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import { defineChat } from "../src/core/define_chat.js";
import { AgUiThreads } from "../src/threads/ag_ui_threads.js";
import { defineThreads } from "../src/threads/define_threads.js";
import type { ThreadRow, ThreadsSelectDetail } from "../src/threads/types.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

defineChat();
defineThreads();

type Script = (emit: Emit) => void | Promise<void>;

interface Mounted {
  readonly chat: AgUiChat;
  readonly list: AgUiThreads;
  /** Lets the run waiting on its gate finish. */
  readonly release: () => void;
}

const answers: Script = (emit) => {
  emit.runStart();
  emit.textEnd("an answer");
  emit.runEnd();
};

function chatWith(script: Script = answers, store?: ClientConversationStore): AgUiChat {
  const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
  chat.id = "chat";
  chat.setAttribute("endpoint", "/agent/");
  chat.setAttribute("data-start-open", "");
  if (store !== undefined) {
    chat.conversationStore = store;
  }
  chat.agentFactory = () => makeFakeAgent({ script }).agent;
  return chat;
}

function mount(
  options: { gated?: boolean; failing?: boolean; store?: ClientConversationStore } = {},
): Mounted {
  const gates: (() => void)[] = [];
  let runs = 0;
  const script: Script = async (emit) => {
    runs += 1;
    emit.runStart();
    if (options.gated === true) {
      await new Promise<void>((resolve) => gates.push(resolve));
    }
    if (options.failing === true && runs === 1) {
      emit.error("boom");
      return;
    }
    emit.textEnd("an answer");
    emit.runEnd();
  };
  const chat = chatWith(script, options.store);
  const list = document.createElement(THREADS_TAG) as AgUiThreads;
  list.setAttribute("for", "chat");
  document.body.append(list, chat);
  return { chat, list, release: () => gates.shift()?.() };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
}

function rows(list: AgUiThreads): HTMLLIElement[] {
  return [...(list.shadowRoot as ShadowRoot).querySelectorAll<HTMLLIElement>(".row")];
}

function row(list: AgUiThreads, threadId: string): HTMLLIElement {
  const found = rows(list).find((item) => item.dataset["threadId"] === threadId);
  if (found === undefined) {
    throw new Error(`expected a row for ${threadId}`);
  }
  return found;
}

function titles(list: AgUiThreads): string[] {
  return rows(list).map((item) => item.querySelector(".title")?.textContent ?? "");
}

function saved(store: ClientConversationStore, threadId: string, content = threadId): void {
  store.saveMessages(threadId, [{ id: `u-${threadId}`, role: "user", content } as Message]);
}

async function send(chat: AgUiChat): Promise<void> {
  const input = chat.shadowRoot?.querySelector<HTMLTextAreaElement>(".input");
  if (input == null) {
    throw new Error("expected the composer");
  }
  input.value = "hi";
  chat.shadowRoot?.querySelector<HTMLButtonElement>(".send")?.click();
  await flush();
}

/** A store whose rows the test writes, extra keys and all, over a real one. */
function rowStore(listed: readonly ThreadRow[]): ClientConversationStore {
  const inner = new SessionStorageStore("rows");
  return {
    threadId: () => inner.threadId(),
    newThread: () => inner.newThread(),
    loadMessages: (id) => inner.loadMessages(id),
    saveMessages: (id, messages) => inner.saveMessages(id, messages),
    loadCheckpoint: (id) => inner.loadCheckpoint(id),
    saveCheckpoint: (id, checkpoint) => inner.saveCheckpoint(id, checkpoint),
    clear: (id) => inner.clear(id),
    listThreads: () => Promise.resolve([...listed]),
    setActiveThread: (id) => inner.setActiveThread(id),
    renameThread: (id, title) => inner.renameThread(id, title),
  };
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

describe("binding", () => {
  it("lists the chat named by for, with the thread on screen marked", async () => {
    const { chat, list } = mount();
    await flush();
    saved(chat.conversationStore, "t1", "first");
    saved(chat.conversationStore, "t2", "second");
    await chat.switchThread("t2");
    await flush();

    expect(list.chat).toBe(chat);
    expect(titles(list).sort()).toEqual(["first", "second"]);
    expect(list.threads.map((listed) => listed.threadId).sort()).toEqual(["t1", "t2"]);
    expect(row(list, "t2").hasAttribute("data-active")).toBe(true);
    expect(row(list, "t2").querySelector(".row-main")?.getAttribute("aria-current")).toBe("true");
    expect(row(list, "t1").hasAttribute("data-active")).toBe(false);
  });

  it("binds a chat placed after the list once it reports its thread", async () => {
    const list = document.createElement(THREADS_TAG) as AgUiThreads;
    list.setAttribute("for", "chat");
    document.body.append(list);
    await flush();
    expect(list.chat).toBeNull();

    const chat = chatWith();
    document.body.append(chat);
    await flush();

    expect(list.chat).toBe(chat);
  });

  it("ignores another element's thread event while waiting", async () => {
    const list = document.createElement(THREADS_TAG) as AgUiThreads;
    list.setAttribute("for", "chat");
    document.body.append(list);
    const other = chatWith();
    other.id = "other";
    document.body.append(other);
    document.body.dispatchEvent(new CustomEvent("ag-ui-thread"));
    await flush();

    expect(list.chat).toBeNull();
  });

  it("binds nothing without for and without a chat", async () => {
    const list = document.createElement(THREADS_TAG) as AgUiThreads;
    document.body.append(list, chatWith());
    await flush();

    expect(list.chat).toBeNull();
    expect(rows(list)).toEqual([]);
    expect(list.hasAttribute("data-empty")).toBe(false);
  });

  it("finds its chat inside the shadow root it sits in", async () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const chat = chatWith();
    const list = document.createElement(THREADS_TAG) as AgUiThreads;
    list.setAttribute("for", "chat");
    root.append(chat, list);
    document.body.append(host);
    await flush();

    expect(list.chat).toBe(chat);
  });

  it("takes a chat set by property over for, and goes back to for when cleared", async () => {
    const { chat, list } = mount();
    const other = chatWith();
    other.id = "other";
    document.body.append(other);
    await flush();

    list.chat = other;
    expect(list.chat).toBe(other);
    list.chat = null;
    expect(list.chat).toBe(chat);
  });

  it("rebinds when for changes and lets go on disconnect", async () => {
    const { chat, list } = mount();
    const other = chatWith();
    other.id = "other";
    document.body.append(other);
    await flush();

    list.setAttribute("for", "other");
    expect(list.chat).toBe(other);
    list.setAttribute("for", "missing");
    expect(list.chat).toBeNull();
    list.setAttribute("for", "other");
    list.remove();
    expect(list.chat).toBeNull();
    expect(rows(list)).toEqual([]);

    document.body.append(list);
    list.setAttribute("for", "chat");
    expect(list.chat).toBe(chat);
  });

  it("does not list before the chat has a thread", async () => {
    const chat = chatWith();
    const listThreads = vi.spyOn(chat.conversationStore, "listThreads");
    const list = document.createElement(THREADS_TAG) as AgUiThreads;
    list.chat = chat;
    await flush();

    expect(listThreads).not.toHaveBeenCalled();
  });

  it("keeps a listing that lands after a newer one from painting", async () => {
    const { chat, list } = mount();
    await flush();
    let resolveSlow: (rows: ThreadRow[]) => void = () => undefined;
    const slow = new Promise<ThreadRow[]>((resolve) => {
      resolveSlow = resolve;
    });
    const fresh: ThreadRow = { threadId: "t-new", title: "new", updatedAt: 2, preview: "" };
    vi.spyOn(chat.conversationStore, "listThreads")
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce([fresh]);

    const first = list.refresh();
    await flush();
    await list.refresh();
    resolveSlow([{ threadId: "t-old", title: "old", updatedAt: 1, preview: "" }]);
    await first;
    await flush();

    expect(titles(list)).toEqual(["new"]);
  });

  it("keeps the last list when the store fails to list", async () => {
    const { chat, list } = mount();
    await flush();
    saved(chat.conversationStore, "t1", "kept");
    await list.refresh();
    vi.spyOn(chat.conversationStore, "listThreads").mockRejectedValue(new Error("offline"));

    await list.refresh();

    expect(titles(list)).toEqual(["kept"]);
  });

  it("shares one listing between calls made together", async () => {
    const { chat, list } = mount();
    await flush();
    const listThreads = vi.spyOn(chat.conversationStore, "listThreads");

    await Promise.all([list.refresh(), list.refresh(), list.refresh()]);

    expect(listThreads).toHaveBeenCalledTimes(1);
  });
});

describe("driving the chat", () => {
  it("switches the chat to a picked row, announcing it first", async () => {
    const { chat, list } = mount();
    await flush();
    saved(chat.conversationStore, "t1");
    await list.refresh();
    const picked: ThreadsSelectDetail[] = [];
    list.addEventListener(THREADS_SELECT_EVENT, (event) => {
      picked.push((event as CustomEvent<ThreadsSelectDetail>).detail);
    });

    row(list, "t1").querySelector<HTMLButtonElement>(".row-main")?.click();
    await flush();

    expect(picked).toEqual([{ threadId: "t1" }]);
    expect(chat.threadId).toBe("t1");
    expect(row(list, "t1").hasAttribute("data-active")).toBe(true);
  });

  it("leaves the chat alone when the host cancels the pick", async () => {
    const { chat, list } = mount();
    await flush();
    const before = chat.threadId;
    saved(chat.conversationStore, "t1");
    await list.refresh();
    list.addEventListener(THREADS_SELECT_EVENT, (event) => event.preventDefault());

    row(list, "t1").querySelector<HTMLButtonElement>(".row-main")?.click();
    await flush();

    expect(chat.threadId).toBe(before);
  });

  it("swallows a load the store rejects", async () => {
    const { chat, list } = mount();
    await flush();
    saved(chat.conversationStore, "t1");
    await list.refresh();
    vi.spyOn(chat, "switchThread").mockRejectedValue(new Error("gone"));

    row(list, "t1").querySelector<HTMLButtonElement>(".row-main")?.click();
    await flush();

    expect(chat.switchThread).toHaveBeenCalledWith("t1");
  });

  it("deletes a row after the inline confirm, and keeps it on cancel", async () => {
    const { chat, list } = mount();
    await flush();
    saved(chat.conversationStore, "t1", "doomed");
    await list.refresh();
    const remove = (): void => {
      row(list, "t1").querySelector<HTMLButtonElement>(".delete")?.click();
    };

    remove();
    const confirm = row(list, "t1").querySelector(".confirm");
    expect(confirm?.textContent).toContain("Delete this conversation?");
    expect(row(list, "t1").querySelector<HTMLElement>(".row-main")?.hidden).toBe(true);
    expect(list.shadowRoot?.activeElement?.className).toBe("no");
    row(list, "t1").querySelector<HTMLButtonElement>(".no")?.click();
    expect(row(list, "t1").querySelector(".confirm")).toBeNull();

    remove();
    row(list, "t1").querySelector<HTMLButtonElement>(".yes")?.click();
    await flush();

    expect(titles(list)).toEqual([]);
    expect(await chat.conversationStore.listThreads()).toEqual([]);
  });

  it("keeps focus on a picked row through the redraw the switch causes", async () => {
    const { chat, list } = mount();
    await flush();
    saved(chat.conversationStore, "t1");
    await list.refresh();
    const pick = row(list, "t1").querySelector<HTMLButtonElement>(".row-main");
    pick?.focus();

    pick?.click();
    await flush();

    expect(chat.threadId).toBe("t1");
    const focused = list.shadowRoot?.activeElement as HTMLElement | null;
    expect(focused?.className).toBe("row-main");
    expect(focused?.closest<HTMLElement>(".row")?.dataset["threadId"]).toBe("t1");
  });

  it("keeps focus in an open confirm through a redraw", async () => {
    const { chat, list } = mount();
    await flush();
    saved(chat.conversationStore, "t1");
    await list.refresh();
    row(list, "t1").querySelector<HTMLButtonElement>(".delete")?.click();

    await list.refresh();

    expect(list.shadowRoot?.activeElement?.className).toBe("no");
    expect(row(list, "t1").querySelector(".confirm")).not.toBeNull();
  });

  it("re-reads nothing when only the unread marks change", async () => {
    const { chat } = mount();
    await flush();
    const listThreads = vi.spyOn(chat.conversationStore, "listThreads");

    chat.setCollapsed(true);
    chat.setCollapsed(false);
    await flush();

    expect(listThreads).not.toHaveBeenCalled();
  });

  it("names the delete button after its row", async () => {
    const { chat, list } = mount();
    await flush();
    saved(chat.conversationStore, "t1", "Taxes");
    await list.refresh();

    expect(row(list, "t1").querySelector(".delete")?.getAttribute("aria-label")).toBe(
      "Delete Taxes",
    );
  });

  it("draws pills with no empty text, and deletes from a pill after the inline confirm", async () => {
    const { chat, list } = mount();
    list.variant = "pills";
    await flush();
    expect(list.shadowRoot?.querySelector<HTMLElement>(".empty")?.hidden).toBe(true);
    expect(list.hasAttribute("data-empty")).toBe(true);
    saved(chat.conversationStore, "t1", "Taxes");
    await list.refresh();
    expect(list.variant).toBe("pills");
    expect(row(list, "t1").querySelector(".delete")?.getAttribute("aria-label")).toBe(
      "Delete Taxes",
    );

    row(list, "t1").querySelector<HTMLButtonElement>(".delete")?.click();
    expect(row(list, "t1").hasAttribute("data-confirming")).toBe(true);
    expect(list.shadowRoot?.activeElement?.className).toBe("no");
    row(list, "t1").querySelector<HTMLButtonElement>(".yes")?.click();
    await flush();

    expect(titles(list)).toEqual([]);
    expect(await chat.conversationStore.listThreads()).toEqual([]);
  });

  it("says when there is nothing to list", async () => {
    const { list } = mount();
    await flush();

    expect(list.variant).toBe("list");
    expect(list.shadowRoot?.querySelector<HTMLElement>(".list")?.hidden).toBe(true);
    expect(list.shadowRoot?.querySelector<HTMLElement>(".empty")?.hidden).toBe(false);
    expect(list.shadowRoot?.querySelector(".empty")?.textContent).toBe("No conversations yet");
  });
});

describe("run marks", () => {
  function marked(list: AgUiThreads): boolean {
    const root = list.shadowRoot as ShadowRoot;
    return (
      root.querySelector("[data-status], .mark, [part~='mark'], .sr") !== null ||
      rows(list).some(
        (item) =>
          item.querySelector(".row-main")?.textContent !==
          item.querySelector(".title")?.textContent,
      )
    );
  }

  it("draws no mark on a thread running here, or one whose run failed", async () => {
    const { chat, list, release } = mount({ gated: true });
    await flush();
    const threadId = chat.threadId as string;

    await send(chat);
    expect(chat.running).toBe(true);
    expect(row(list, threadId)).toBeDefined();
    expect(marked(list)).toBe(false);
    release();
    await flush();

    const failing = mount({ failing: true });
    await flush();
    await send(failing.chat);
    expect(marked(failing.list)).toBe(false);
  });

  it("marks each row with the status its store reports, waiting over unread", async () => {
    const listed: ThreadRow[] = [
      { threadId: "a", title: "A", updatedAt: 1, preview: "", status: "running" },
      { threadId: "w", title: "W", updatedAt: 1, preview: "", status: "waiting", unread: true },
      { threadId: "f", title: "F", updatedAt: 1, preview: "", status: "failed", reason: "error" },
      { threadId: "u", title: "", updatedAt: 1, preview: "", status: "idle", unread: true },
      { threadId: "i", title: "I", updatedAt: 1, preview: "", status: "idle", unread: false },
    ];
    const { list } = mount({ store: rowStore(listed) });
    await flush();

    expect(titles(list)).toEqual(["A", "W", "F", "New conversation", "I"]);
    const marks = rows(list).map((item) => item.dataset["status"] ?? null);
    expect(marks).toEqual(["running", "waiting", "failed", "unread", null]);
    const mark = row(list, "w")?.querySelector(".row-main .mark");
    expect(mark?.getAttribute("part")).toBe("mark mark-waiting");
    expect(row(list, "w")?.querySelector(".row-main")?.textContent).toBe("WWaiting");
    expect(row(list, "i")?.querySelector(".mark")).toBeNull();
  });

  it("names its marks in the strings it is given", async () => {
    const listed: ThreadRow[] = [
      { threadId: "a", title: "A", updatedAt: 1, preview: "", status: "running" },
    ];
    const { list } = mount({ store: rowStore(listed) });
    list.strings = { running: "Läuft" };
    await flush();

    expect(row(list, "a")?.querySelector(".mark")?.textContent).toBe("Läuft");
  });

  it("draws the rows a chat's watch hands on without listing again", async () => {
    const listed: ThreadRow[] = [{ threadId: "a", title: "A", updatedAt: 1, preview: "" }];
    const store = rowStore(listed);
    const { chat, list } = mount({ store });
    await flush();
    const listThreads = vi.spyOn(store, "listThreads");

    chat.dispatchEvent(
      new CustomEvent(THREADS_CHANGE_EVENT, {
        detail: { threads: [{ ...listed[0], status: "failed" }] },
      }),
    );
    await flush();

    expect(row(list, "a")?.dataset["status"]).toBe("failed");
    expect(listThreads).not.toHaveBeenCalled();
  });

  it("re-lists when a run finishes, so a thread the run touched moves", async () => {
    const { chat, list } = mount();
    await flush();
    const listThreads = vi.spyOn(chat.conversationStore, "listThreads");

    await send(chat);

    expect(listThreads).toHaveBeenCalled();
    expect(row(list, chat.threadId as string)).toBeDefined();
  });
});

describe("strings", () => {
  it("merges a host's strings over the defaults and redraws", async () => {
    const listed = [{ threadId: "i", title: "", updatedAt: 1, preview: "" }];
    const { list } = mount({ store: rowStore(listed) });
    await flush();

    list.strings = { label: "Gespräche", untitled: "Neu" };

    expect(list.shadowRoot?.querySelector(".list")?.getAttribute("aria-label")).toBe("Gespräche");
    expect(list.strings.empty).toBe("No conversations yet");
    expect(titles(list)).toEqual(["Neu"]);
  });
});

describe("defineThreads", () => {
  it("is a no-op when this class holds the tag", () => {
    expect(() => defineThreads()).not.toThrow();
    expect(customElements.get(THREADS_TAG)).toBe(AgUiThreads);
  });

  it("throws naming the tag when another class holds it", async () => {
    vi.spyOn(customElements, "get").mockReturnValue(class extends HTMLElement {});

    expect(() => defineThreads()).toThrow("<ag-ui-threads> is already defined by another class");
  });
});
