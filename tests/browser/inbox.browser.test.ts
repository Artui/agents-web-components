import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { InboxRow } from "../../src/agents/types.js";
import { INBOX_CHANGE_EVENT } from "../../src/constants.js";
import { type AgUiInbox, defineInbox, INBOX_TAG, type InboxProvider } from "../../src/inbox.js";

/**
 * The inbox in a real engine: markup in a title or a summary lands as text,
 * the badge's popover stays in the viewport from a navbar's far end and scrolls
 * a long list, the keyboard walks it, and the colours follow the page's scheme.
 */

const MARKUP = '<img src=x onerror="window.__inboxXss = true">';

function waiting(threadId: string, title: string, message = "Archive the board?"): InboxRow {
  return {
    threadId,
    agentId: "board",
    title,
    updatedAt: 0,
    preview: "",
    status: "waiting",
    interrupts: [
      {
        id: `int-${threadId}`,
        reason: "tool_call",
        message,
        toolCallId: threadId,
        metadata: { destructive: false, kind: "approval" },
      },
    ],
  } as InboxRow;
}

function fakeProvider(rows: readonly InboxRow[]): InboxProvider & { opened: string[] } {
  const opened: string[] = [];
  const element = document.createElement("div") as unknown as InboxProvider & {
    opened: string[];
  };
  Object.assign(element, {
    inbox: rows,
    agents: [],
    opened,
    openThread: (agentId: string, threadId: string) => {
      opened.push(`${agentId}/${threadId}`);
      return Promise.resolve();
    },
  });
  return element;
}

async function mount(
  rows: readonly InboxRow[],
  variant: "badge" | "list" = "badge",
): Promise<{ inbox: AgUiInbox; provider: ReturnType<typeof fakeProvider> }> {
  const bar = document.createElement("nav");
  bar.style.cssText = "display:flex;justify-content:flex-end;width:100%;";
  const provider = fakeProvider(rows);
  const inbox = document.createElement(INBOX_TAG) as AgUiInbox;
  inbox.setAttribute("variant", variant);
  bar.append(inbox);
  document.body.append(provider, bar);
  inbox.provider = provider;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return { inbox, provider };
}

function shadow(inbox: AgUiInbox): ShadowRoot {
  return inbox.shadowRoot as ShadowRoot;
}

beforeAll(() => {
  defineInbox();
});

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.style.colorScheme = "";
  delete (window as { __inboxXss?: boolean }).__inboxXss;
});

describe("<ag-ui-inbox> in Chromium", () => {
  it("draws markup in a title and a summary as text", async () => {
    const { inbox } = await mount([waiting("a", MARKUP, MARKUP)], "list");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(shadow(inbox).querySelector("img")).toBeNull();
    expect((window as { __inboxXss?: boolean }).__inboxXss).toBeUndefined();
    expect(shadow(inbox).querySelector(".title")?.textContent).toBe(MARKUP);
    expect(shadow(inbox).querySelector(".summary")?.textContent).toBe(`Approval: ${MARKUP}`);
  });

  it("opens from a navbar's far end inside the viewport, and scrolls a long list", async () => {
    await page.viewport(360, 640);
    const rows = Array.from({ length: 30 }, (_, index) => waiting(`t${index}`, `Thread ${index}`));
    const { inbox } = await mount(rows);
    await userEvent.click(shadow(inbox).querySelector(".badge") as HTMLElement);
    const panel = shadow(inbox).querySelector(".panel") as HTMLElement;
    const box = panel.getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(window.innerWidth);
    expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight);
    const title = shadow(inbox).querySelector(".title") as HTMLElement;
    expect(title.scrollWidth).toBeGreaterThanOrEqual(title.clientWidth);
    expect(getComputedStyle(title).textOverflow).toBe("ellipsis");
  });

  it("walks the list by keyboard: Enter opens, arrows move, Enter picks, Escape returns", async () => {
    const { inbox, provider } = await mount([waiting("a", "First"), waiting("b", "Second")]);
    const badge = shadow(inbox).querySelector(".badge") as HTMLButtonElement;
    badge.focus();
    await userEvent.keyboard("{Enter}");
    expect(inbox.open).toBe(true);
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    expect(provider.opened).toEqual(["board/b"]);
    expect(inbox.open).toBe(false);

    badge.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Escape}");
    expect(inbox.open).toBe(false);
    expect(shadow(inbox).activeElement).toBe(badge);
  });

  it("paints the popover's own ink when the navbar sets a light colour on the host", async () => {
    const { inbox } = await mount([waiting("a", "First")]);
    inbox.style.color = "rgb(255, 255, 255)";
    await userEvent.click(shadow(inbox).querySelector(".badge") as HTMLElement);
    const panel = shadow(inbox).querySelector(".panel") as HTMLElement;
    const title = shadow(inbox).querySelector(".title") as HTMLElement;
    const badge = shadow(inbox).querySelector(".badge") as HTMLElement;
    expect(getComputedStyle(badge).color).toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(title).color).not.toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(title).color).not.toBe(getComputedStyle(panel).backgroundColor);
  });

  it("follows the page's colour scheme and the shared tokens", async () => {
    const { inbox, provider } = await mount([waiting("a", "First")]);
    const count = shadow(inbox).querySelector(".count") as HTMLElement;
    const light = getComputedStyle(count).backgroundColor;
    document.documentElement.style.colorScheme = "dark";
    const dark = getComputedStyle(count).backgroundColor;
    expect(dark).not.toBe(light);
    inbox.style.setProperty("--ag-ui-waiting", "rgb(1, 2, 3)");
    expect(getComputedStyle(count).backgroundColor).toBe("rgb(1, 2, 3)");

    provider.dispatchEvent(new CustomEvent(INBOX_CHANGE_EVENT));
    expect(inbox.getAttribute("data-count")).toBe("1");
  });
});

describe("<ag-ui-inbox> as a list in a narrow rail", () => {
  it("stays inside the rail, in the flow, with no popover chrome", async () => {
    const rail = document.createElement("aside");
    rail.style.cssText = "width:240px;margin-left:200px;";
    const provider = fakeProvider([
      waiting("a", "A long title that has to be cut short somewhere"),
    ]);
    const list = document.createElement(INBOX_TAG) as AgUiInbox;
    list.setAttribute("variant", "list");
    rail.append(list);
    document.body.append(provider, rail);
    list.provider = provider;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const panel = shadow(list).querySelector(".panel") as HTMLElement;
    const railBox = rail.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    expect(getComputedStyle(panel).position).toBe("static");
    expect(box.left).toBeGreaterThanOrEqual(railBox.left);
    expect(box.right).toBeLessThanOrEqual(railBox.right);
    expect(list.offsetHeight).toBeGreaterThan(0);
  });
});
