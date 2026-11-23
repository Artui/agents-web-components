/**
 * The child-session link and the parent breadcrumb in a real layout, at the
 * narrow end, and with a parent title carrying markup.
 *
 * The breadcrumb is a new row in the chat column and the link a new line in a
 * card, so each is measured against its container rather than checked for
 * display. A title is set as text: an image tag in one must reach the screen
 * as the characters, which only a real DOM can show.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../../src/core/conversation_store.js";
import { defineChat } from "../../src/core/define_chat.js";
import { RECEIPT_CONTENT } from "../helpers/child_session_fixture.js";

const MARKUP_TITLE =
  '<img src="x" onerror="window.__breadcrumbPwned = true"> a parent conversation whose title runs well past the width of a narrow panel';

const PARENT = [
  { id: "u1", role: "user", content: "research the invoices" },
  {
    id: "a1",
    role: "assistant",
    content: "",
    toolCalls: [
      {
        id: "tc1",
        type: "function",
        function: { name: "start_session", arguments: '{"agent":"researcher"}' },
      },
    ],
  },
  { id: "r1", role: "tool", toolCallId: "tc1", content: RECEIPT_CONTENT },
] as Message[];

const CHILD = [
  { id: "c1", role: "user", content: "invoices" },
  { id: "c2", role: "assistant", content: "Researching." },
] as Message[];

const THREADS: readonly ThreadMeta[] = [
  { threadId: "parent-thread", title: MARKUP_TITLE, updatedAt: Date.now(), preview: "" },
  {
    threadId: "child-thread-1",
    title: "Invoices research",
    updatedAt: Date.now(),
    preview: "",
    status: "waiting",
    parent: { threadId: "parent-thread", scope: null },
  },
];

function store(): ClientConversationStore {
  let active = "parent-thread";
  const conversations: Record<string, readonly Message[]> = {
    "parent-thread": PARENT,
    "child-thread-1": CHILD,
  };
  return {
    threadId: () => active,
    setActiveThread: (threadId: string) => {
      active = threadId;
    },
    loadMessages: (threadId: string) => Promise.resolve(conversations[threadId] ?? null),
    saveMessages: () => {},
    loadCheckpoint: (): NavigationCheckpoint | null => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: () => Promise.resolve(THREADS),
    renameThread: () => {},
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function mount(width: string, display: string | null = "full"): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "floating");
  el.setAttribute("data-start-open", "");
  if (display !== null) {
    el.setAttribute("data-tool-display", display);
  }
  el.style.setProperty("--ag-ui-width", width);
  el.conversationStore = store();
  document.body.appendChild(el);
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${selector} in the shadow root`);
  }
  return found;
}

function inside(inner: DOMRect, outer: DOMRect): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.right <= outer.right + 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.bottom <= outer.bottom + 0.5
  );
}

describe("child sessions (real browser)", () => {
  beforeAll(() => {
    defineChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    document.body.replaceChildren();
  });

  it.each(["380px", "240px"])("keeps the link inside its card at %s", async (width) => {
    const el = mount(width);
    await settle();
    const link = part(el, ".child-session-link");
    const card = part(el, ".tool-call");
    expect(link.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(inside(link.getBoundingClientRect(), card.getBoundingClientRect())).toBe(true);
  });

  it.each(["grouped", "inline", "minimal", "compact", "full", null])(
    "draws the link with a box inside its card under data-tool-display=%s",
    async (display) => {
      const el = mount("380px", display);
      await settle();
      const head = el.shadowRoot?.querySelector<HTMLElement>(".tool-group-head");
      if (head !== null && head !== undefined && head.getAttribute("aria-expanded") === "false") {
        head.click();
        await settle();
      }
      const link = part(el, ".child-session-link");
      const box = link.getBoundingClientRect();
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(inside(box, part(el, ".tool-call").getBoundingClientRect())).toBe(true);
    },
  );

  it.each(["380px", "240px"])(
    "keeps the breadcrumb on one line inside the column at %s, its title as text",
    async (width) => {
      const el = mount(width);
      await settle();
      const crumb = part(el, ".parent-breadcrumb");
      expect(getComputedStyle(crumb).display).toBe("none");
      part(el, ".child-session-link").click();
      await settle();
      const chat = part(el, ".chat").getBoundingClientRect();
      const box = crumb.getBoundingClientRect();
      const button = part(el, ".parent-breadcrumb-link");
      expect(getComputedStyle(crumb).display).toBe("flex");
      expect(inside(box, chat)).toBe(true);
      expect(inside(button.getBoundingClientRect(), box)).toBe(true);
      expect(button.getBoundingClientRect().height).toBeLessThan(30);
      expect(crumb.querySelector("img")).toBeNull();
      expect(crumb.innerHTML).toContain("&lt;img");
      expect(button.textContent).toBe(`From ${MARKUP_TITLE}`);
      expect((window as { __breadcrumbPwned?: boolean }).__breadcrumbPwned).toBeUndefined();
      const header = part(el, ".header").getBoundingClientRect();
      const messages = part(el, ".messages-wrap").getBoundingClientRect();
      expect(box.top).toBeGreaterThanOrEqual(header.bottom - 0.5);
      expect(box.bottom).toBeLessThanOrEqual(messages.top + 0.5);
    },
  );

  it("steps a child's drawer row in under its parent's", async () => {
    const el = mount("380px");
    await settle();
    part(el, ".child-session-link").click();
    await settle();
    part(el, ".drawer").hidden = false;
    await settle();
    const rows = [...(el.shadowRoot?.querySelectorAll<HTMLElement>(".drawer-row") ?? [])];
    expect(rows.map((row) => row.classList.contains("drawer-row--child"))).toEqual([false, true]);
    expect(getComputedStyle(part(el, ".drawer-children")).paddingInlineStart).toBe("14px");
    const [parent, child] = rows.map((row) => row.getBoundingClientRect());
    expect((child?.left ?? 0) - (parent?.left ?? 0)).toBeCloseTo(14, 0);
    expect(child?.right ?? 0).toBeCloseTo(parent?.right ?? 0, 0);
  });
});
