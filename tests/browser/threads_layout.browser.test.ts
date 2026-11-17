import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG, THREADS_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type { ClientConversationStore } from "../../src/core/conversation_store.js";
import { SessionStorageStore } from "../../src/core/conversation_store.js";
import { defineChat } from "../../src/core/define_chat.js";
import type { AgUiThreads } from "../../src/threads/ag_ui_threads.js";
import { defineThreads } from "../../src/threads/define_threads.js";
import type { ThreadRow } from "../../src/threads/types.js";

/**
 * The thread list's boxes, which happy-dom does not lay out: pills that stay
 * inside a narrow bar and scroll rather than wrap, titles cut with an ellipsis
 * inside their own pill, rows hidden by the inline confirm taking no space, and
 * a mark per status that actually paints.
 */

const LONG = "A conversation about the quarterly numbers and what to do next";

function rowStore(listed: readonly ThreadRow[]): ClientConversationStore {
  const inner = new SessionStorageStore("layout");
  return {
    threadId: () => inner.threadId(),
    loadMessages: (id) => inner.loadMessages(id),
    saveMessages: (id, messages) => inner.saveMessages(id, messages),
    loadCheckpoint: (id) => inner.loadCheckpoint(id),
    saveCheckpoint: (id, checkpoint) => inner.saveCheckpoint(id, checkpoint),
    clear: (id) => inner.clear(id),
    listThreads: () => Promise.resolve(listed),
    setActiveThread: (id) => inner.setActiveThread(id),
    renameThread: (id, title) => inner.renameThread(id, title),
  };
}

async function mount(
  variant: "list" | "pills",
  width: number,
  listed: readonly ThreadRow[],
): Promise<AgUiThreads> {
  const bar = document.createElement("div");
  bar.style.width = `${width}px`;
  const list = document.createElement(THREADS_TAG) as AgUiThreads;
  list.setAttribute("for", "chat");
  list.setAttribute("variant", variant);
  bar.append(list);
  const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
  chat.id = "chat";
  chat.setAttribute("endpoint", "/agent/");
  chat.setAttribute("placement", "embedded");
  chat.style.height = "200px";
  chat.conversationStore = rowStore(listed);
  const restored = new Promise((resolve) => chat.addEventListener("ag-ui-thread", resolve));
  document.body.append(bar, chat);
  await restored;
  await list.refresh();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return list;
}

function all(list: AgUiThreads, selector: string): HTMLElement[] {
  return [...(list.shadowRoot as ShadowRoot).querySelectorAll<HTMLElement>(selector)];
}

function rows(count: number, status?: ThreadRow["status"]): ThreadRow[] {
  return Array.from({ length: count }, (_, index) => ({
    threadId: `t${index}`,
    title: `${LONG} ${index}`,
    updatedAt: index,
    preview: "",
    ...(status === undefined ? {} : { status }),
  }));
}

beforeAll(() => {
  defineChat();
  defineThreads();
});

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
});

describe("pills in a narrow bar", () => {
  it("stay inside the bar on one line and scroll sideways", async () => {
    const list = await mount("pills", 320, rows(6));
    const host = list.getBoundingClientRect();
    const strip = all(list, ".list")[0] as HTMLElement;
    const pills = all(list, ".row");

    expect(strip.getBoundingClientRect().right).toBeLessThanOrEqual(host.right + 0.5);
    expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth);
    const tops = new Set(pills.map((pill) => Math.round(pill.getBoundingClientRect().top)));
    expect(tops.size).toBe(1);
  });

  it("cut a long title inside its own pill", async () => {
    const list = await mount("pills", 320, rows(1));
    const pill = all(list, ".row")[0] as HTMLElement;
    const title = all(list, ".title")[0] as HTMLElement;
    const box = pill.getBoundingClientRect();
    const text = title.getBoundingClientRect();

    expect(pill.offsetWidth).toBeLessThanOrEqual(14 * 16);
    expect(getComputedStyle(title).textOverflow).toBe("ellipsis");
    expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
    expect(text.left).toBeGreaterThanOrEqual(box.left);
    expect(text.right).toBeLessThanOrEqual(box.right);
  });
});

describe("rows in a narrow rail", () => {
  it("keep the delete button inside the row", async () => {
    const list = await mount("list", 220, rows(2));
    const row = all(list, ".row")[0] as HTMLElement;
    const remove = all(list, ".delete")[0] as HTMLElement;

    expect(remove.getBoundingClientRect().right).toBeLessThanOrEqual(
      row.getBoundingClientRect().right,
    );
    expect(remove.offsetWidth).toBeGreaterThan(0);
  });

  it("take the hidden parts out of the layout while confirming a delete", async () => {
    const list = await mount("list", 220, rows(1));
    (all(list, ".delete")[0] as HTMLElement).click();
    const main = all(list, ".row-main")[0] as HTMLElement;
    const remove = all(list, ".delete")[0] as HTMLElement;
    const confirm = all(list, ".confirm")[0] as HTMLElement;

    expect(main.hidden).toBe(true);
    expect(getComputedStyle(main).display).toBe("none");
    expect(getComputedStyle(remove).display).toBe("none");
    expect(confirm.offsetHeight).toBeGreaterThan(0);
  });

  it("hide the empty text in a list that has rows, and the list when it has none", async () => {
    const full = await mount("list", 220, rows(1));
    expect(getComputedStyle(all(full, ".empty")[0] as HTMLElement).display).toBe("none");
    document.body.replaceChildren();

    const empty = await mount("list", 220, []);
    expect(getComputedStyle(all(empty, ".list")[0] as HTMLElement).display).toBe("none");
    expect((all(empty, ".empty")[0] as HTMLElement).offsetHeight).toBeGreaterThan(0);
  });
});

describe("marks", () => {
  it("paint a distinct colour per status and nothing when idle", async () => {
    const listed: ThreadRow[] = [
      { threadId: "r", title: "r", updatedAt: 1, preview: "", status: "running" },
      { threadId: "w", title: "w", updatedAt: 1, preview: "", status: "waiting" },
      { threadId: "f", title: "f", updatedAt: 1, preview: "", status: "failed" },
      { threadId: "u", title: "u", updatedAt: 1, preview: "", unread: true },
      { threadId: "i", title: "i", updatedAt: 1, preview: "" },
    ];
    const list = await mount("list", 320, listed);
    const colours = all(list, ".mark").map((mark) => getComputedStyle(mark).backgroundColor);

    expect(colours[4]).toBe("rgba(0, 0, 0, 0)");
    expect(new Set(colours.slice(0, 4)).size).toBe(4);
    expect(colours.slice(0, 4)).not.toContain("rgba(0, 0, 0, 0)");
  });
});
