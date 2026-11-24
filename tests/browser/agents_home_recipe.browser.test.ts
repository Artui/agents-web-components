import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import readme from "../../README.md?raw";
import type { InboxRow } from "../../src/agents/types.js";
import { ELEMENT_TAG } from "../../src/constants.js";
import { defineChat } from "../../src/core/define_chat.js";
import { type AgUiInbox, defineInbox, INBOX_TAG } from "../../src/inbox.js";

/**
 * The README's "An agents home" stylesheet, read from the README itself: a fixed header is its
 * own stacking context, so the inbox popover in it must out-rank the page chat to stay visible.
 */

function recipeCss(): string {
  const section = readme.slice(readme.indexOf("## An agents home"));
  const match = /<style>([\s\S]*?)<\/style>/.exec(section);
  return (match as RegExpExecArray)[1] as string;
}

function waiting(threadId: string): InboxRow {
  return {
    threadId,
    agentId: "board",
    title: `Thread ${threadId}`,
    updatedAt: 0,
    preview: "",
    status: "waiting",
    interrupts: [
      {
        id: `int-${threadId}`,
        reason: "tool_call",
        message: "Archive?",
        toolCallId: threadId,
        metadata: { destructive: false, kind: "approval" },
      },
    ],
  } as InboxRow;
}

beforeAll(() => {
  defineInbox();
  defineChat();
});

afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelector("#recipe")?.remove();
});

describe("the README's agents home page", () => {
  it.each([
    ["1024px wide", 1024],
    ["375px wide, the rail a strip under the header", 375],
  ])("keeps the header's inbox popover above the page chat at %s", async (_label, width) => {
    await page.viewport(width, 700);
    const style = document.createElement("style");
    style.id = "recipe";
    style.textContent = recipeCss();
    document.head.append(style);
    const header = document.createElement("header");
    const inbox = document.createElement(INBOX_TAG) as AgUiInbox;
    header.append(inbox);
    const chat = document.createElement(ELEMENT_TAG);
    chat.setAttribute("endpoint", "/agent/");
    chat.setAttribute("placement", "page");
    const provider = document.createElement("div");
    Object.assign(provider, {
      inbox: Array.from({ length: 6 }, (_, index) => waiting(`t${index}`)),
      agents: [],
      openThread: () => Promise.resolve(),
    });
    document.body.append(header, chat, provider);
    (inbox as unknown as { provider: unknown }).provider = provider;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    inbox.open = true;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const popover = (
      (inbox.shadowRoot as ShadowRoot).querySelector(".panel") as HTMLElement
    ).getBoundingClientRect();
    const chatTop = (
      (chat.shadowRoot as ShadowRoot).querySelector(".chat") as HTMLElement
    ).getBoundingClientRect().top;
    const y = popover.bottom - 4;
    expect(y).toBeGreaterThan(chatTop);
    expect(document.elementFromPoint(popover.left + popover.width / 2, y)).toBe(inbox);
  });
});
