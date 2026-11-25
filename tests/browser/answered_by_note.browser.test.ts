/**
 * Whether the answered-by note is on screen once its call is done. happy-dom
 * applies no shadow CSS, so only a browser can see a rule that hides it. The
 * stored tool messages are django-ag-ui's own, from the recorded fixture.
 */

import type { Message } from "@ag-ui/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type { ClientConversationStore } from "../../src/core/conversation_store.js";
import { defineChat } from "../../src/core/define_chat.js";
import fixture from "../fixtures/answered_by.json";
import { shadow } from "../helpers/recorded_wire.js";

defineChat();

beforeEach(() => {
  document.body.innerHTML = "";
});

const KINDS = [
  ["reviewer", "Approved by a reviewer model"],
  ["routine", "Approved by a routine"],
] as const;

/** A stored thread of one call per tool message given, all in one run of calls. */
async function mount(
  tools: readonly object[],
  attributes: Record<string, string> = {},
): Promise<AgUiChat> {
  const calls = tools.map((_, i) => ({
    id: `tc${i}`,
    type: "function",
    function: { name: "book_flight", arguments: '{"seat":"12A"}' },
  }));
  const messages = [
    { id: "u", role: "user", content: "book me a flight" },
    { id: "a", role: "assistant", toolCalls: calls },
    ...tools.map((tool, i) => ({ ...tool, id: `t${i}`, toolCallId: `tc${i}` })),
  ] as unknown as readonly Message[];
  const store: ClientConversationStore = {
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: () => Promise.resolve(messages),
    saveMessages: () => {},
    loadCheckpoint: () => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: () => Promise.resolve([]),
    renameThread: () => {},
  };
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  el.conversationStore = store;
  document.body.appendChild(el);
  await vi.waitFor(() => {
    expect(shadow(el).querySelectorAll(".tool-call")).toHaveLength(tools.length);
  });
  return el;
}

function one(el: AgUiChat, selector: string): HTMLElement {
  const found = shadow(el).querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

function drawn(el: AgUiChat, selector: string): boolean {
  return one(el, selector).getClientRects().length > 0;
}

function expectNoteInCard(el: AgUiChat, words: string): void {
  const note = one(el, ".tool-call-answered-by");
  expect(note.textContent).toBe(words);
  expect(drawn(el, ".tool-call-answered-by")).toBe(true);
  const box = note.getBoundingClientRect();
  const card = one(el, ".tool-call").getBoundingClientRect();
  expect(box.width).toBeGreaterThan(0);
  expect(box.left).toBeGreaterThanOrEqual(card.left);
  expect(box.right).toBeLessThanOrEqual(card.right + 0.5);
  expect(box.bottom).toBeLessThanOrEqual(card.bottom + 0.5);
}

describe.each(KINDS)("the note on a done %s-approved call", (kind, words) => {
  const tool = fixture.messages[kind];

  it("is drawn on a compact card", async () => {
    const el = await mount([tool], { "data-tool-display": "compact" });

    expect(one(el, ".tool-call").getAttribute("data-status")).toBe("done");
    expect(one(el, ".tool-call").getAttribute("data-expanded")).toBe("false");
    expectNoteInCard(el, words);
  });

  it.each(["full", "compact", "inline"])(
    "is drawn in an opened one-step group with %s calls, and nothing else of the head is",
    async (inner) => {
      const el = await mount([tool], { "data-tool-group-display": inner });
      expect(one(el, ".tool-group").getAttribute("data-count")).toBe("1");
      one(el, ".tool-group-head").click();

      expectNoteInCard(el, words);
      expect(drawn(el, ".tool-call-icon")).toBe(false);
      expect(drawn(el, ".tool-call-name")).toBe(false);
      expect(drawn(el, ".tool-call-status")).toBe(false);
      expect(drawn(el, ".tool-call-toggle")).toBe(true);
    },
  );

  it("sits beside the whole head once a second step joins the group", async () => {
    const { metadata: _dropped, ...bare } = tool;
    const el = await mount([tool, bare]);
    one(el, ".tool-group-head").click();

    expectNoteInCard(el, words);
    expect(drawn(el, ".tool-call-name")).toBe(true);
    expect(drawn(el, ".tool-call-status")).toBe(true);
  });
});

describe("a done call with no note", () => {
  it("still draws no head in a one-step group", async () => {
    const { metadata: _dropped, ...bare } = fixture.messages.routine;
    const el = await mount([bare]);
    one(el, ".tool-group-head").click();

    expect(drawn(el, ".tool-call-head")).toBe(false);
    expect(drawn(el, ".tool-call-toggle")).toBe(true);
  });
});
