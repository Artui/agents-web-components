import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { InboxRow } from "../../src/agents/types.js";
import { ELEMENT_TAG, INBOX_CHANGE_EVENT } from "../../src/constants.js";
import { defineChat } from "../../src/core/define_chat.js";
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
  defineChat();
});

afterEach(() => {
  vi.unstubAllGlobals();
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

describe("<ag-ui-inbox> answering in place in Chromium", () => {
  it("lays Approve and Deny inside the popover on a phone, reachable by Tab from the row", async () => {
    await page.viewport(360, 640);
    const answerable = {
      ...waiting("a", "A long title that has to be cut short somewhere in a narrow popover"),
      runId: "run-a",
    } as InboxRow;
    const { inbox, provider } = await mount([answerable]);
    Object.assign(provider, {
      agents: [{ id: "board", name: "Board", endpoint: "/board/" }],
    });
    provider.dispatchEvent(new CustomEvent(INBOX_CHANGE_EVENT));
    await userEvent.click(shadow(inbox).querySelector(".badge") as HTMLElement);
    const panel = (shadow(inbox).querySelector(".panel") as HTMLElement).getBoundingClientRect();
    const approve = shadow(inbox).querySelector(".approve") as HTMLButtonElement;
    const deny = shadow(inbox).querySelector(".deny") as HTMLButtonElement;
    for (const button of [approve, deny]) {
      const box = button.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(panel.left);
      expect(box.right).toBeLessThanOrEqual(panel.right);
      expect(box.height).toBeGreaterThanOrEqual(28);
    }
    expect(approve.getBoundingClientRect().right).toBeLessThanOrEqual(
      deny.getBoundingClientRect().left,
    );
    expect(getComputedStyle(approve).backgroundColor).not.toBe(
      getComputedStyle(deny).backgroundColor,
    );
    await userEvent.keyboard("{Tab}");
    expect(shadow(inbox).activeElement).toBe(approve);
  });
});

function answerable(threadId: string): InboxRow {
  return { ...waiting(threadId, `Thread ${threadId}`), runId: `run-${threadId}` } as InboxRow;
}

async function openAnswerable(
  threadIds: readonly string[],
): Promise<{ inbox: AgUiInbox; provider: ReturnType<typeof fakeProvider>; change: () => void }> {
  const { inbox, provider } = await mount(threadIds.map(answerable));
  Object.assign(provider, { agents: [{ id: "board", name: "Board", endpoint: "/board/" }] });
  const change = (): void => {
    provider.dispatchEvent(new CustomEvent(INBOX_CHANGE_EVENT));
  };
  change();
  await userEvent.click(shadow(inbox).querySelector(".badge") as HTMLElement);
  return { inbox, provider, change };
}

function part(inbox: AgUiInbox, threadId: string, selector: string): HTMLButtonElement {
  return shadow(inbox).querySelector(
    `.row[data-thread-id="${threadId}"] ${selector}`,
  ) as HTMLButtonElement;
}

describe("<ag-ui-inbox> keeps keyboard focus through a redraw in Chromium", () => {
  it("keeps focus on the row a provider change redrew, and Escape still closes", async () => {
    const { inbox, change } = await openAnswerable(["a", "b"]);
    await userEvent.keyboard("{ArrowDown}");
    const before = part(inbox, "b", ".row-main");
    expect(shadow(inbox).activeElement).toBe(before);
    change();
    const after = part(inbox, "b", ".row-main");
    expect(after).not.toBe(before);
    expect(shadow(inbox).activeElement).toBe(after);
    await userEvent.keyboard("{Escape}");
    expect(inbox.open).toBe(false);
  });

  it("keeps focus on Deny, and on Approve, across a provider change", async () => {
    const { inbox, change } = await openAnswerable(["a"]);
    await userEvent.keyboard("{Tab}{Tab}");
    expect(shadow(inbox).activeElement).toBe(part(inbox, "a", ".deny"));
    change();
    expect(shadow(inbox).activeElement).toBe(part(inbox, "a", ".deny"));
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    change();
    expect(shadow(inbox).activeElement).toBe(part(inbox, "a", ".approve"));
  });

  it("falls back to the row's button when Enter on Approve disables it, and Escape closes", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("", { status: 200 })));
    const { inbox } = await openAnswerable(["a"]);
    await userEvent.keyboard("{Tab}");
    expect(shadow(inbox).activeElement).toBe(part(inbox, "a", ".approve"));
    await userEvent.keyboard("{Enter}");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(shadow(inbox).activeElement).toBe(part(inbox, "a", ".row-main"));
    await userEvent.keyboard("{Escape}");
    expect(inbox.open).toBe(false);
    expect(shadow(inbox).activeElement).toBe(shadow(inbox).querySelector(".badge"));
  });

  it("hands focus to the badge when the focused row leaves the open list", async () => {
    const { inbox, provider, change } = await openAnswerable(["a", "b"]);
    await userEvent.keyboard("{ArrowDown}");
    Object.assign(provider, { inbox: [answerable("a")] });
    change();
    expect(shadow(inbox).activeElement).toBe(shadow(inbox).querySelector(".badge"));
    await userEvent.keyboard("{Escape}");
    expect(inbox.open).toBe(false);
  });

  it("moves no focus when the redraw happens with the list closed", async () => {
    const { inbox, change } = await openAnswerable(["a"]);
    await userEvent.keyboard("{Escape}");
    change();
    expect(shadow(inbox).activeElement).toBe(shadow(inbox).querySelector(".badge"));
  });
});

describe("<ag-ui-inbox> stacking in Chromium", () => {
  it("opens its popover over a floating chat", async () => {
    await page.viewport(900, 700);
    const chat = document.createElement(ELEMENT_TAG);
    chat.setAttribute("endpoint", "/agent/");
    chat.setAttribute("placement", "floating");
    chat.setAttribute("data-start-open", "");
    document.body.append(chat);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const panel = (chat.shadowRoot as ShadowRoot).querySelector(".chat") as HTMLElement;
    const at = panel.getBoundingClientRect();
    const nav = document.createElement("nav");
    nav.style.cssText = `position:absolute;left:${at.left + at.width - 60}px;top:${at.top + 30}px;`;
    document.body.append(nav);
    const rows = Array.from({ length: 12 }, (_, index) => answerable(`t${index}`));
    const provider = fakeProvider(rows);
    const inbox = document.createElement(INBOX_TAG) as AgUiInbox;
    nav.append(inbox);
    inbox.provider = provider;
    inbox.open = true;
    const popover = (shadow(inbox).querySelector(".panel") as HTMLElement).getBoundingClientRect();
    const x = popover.left + popover.width / 2;
    const y = popover.top + popover.height / 2;
    expect(x).toBeGreaterThan(at.left);
    expect(x).toBeLessThan(at.right);
    expect(y).toBeGreaterThan(at.top);
    expect(y).toBeLessThan(at.bottom);
    expect(document.elementFromPoint(x, y)).toBe(inbox);
  });
});

function between(inbox: AgUiInbox): { before: HTMLButtonElement; after: HTMLButtonElement } {
  const before = document.createElement("button");
  before.textContent = "Before";
  const after = document.createElement("button");
  after.textContent = "After";
  inbox.before(before);
  inbox.after(after);
  return { before, after };
}

describe("<ag-ui-inbox> names its popup and closes when focus leaves it in Chromium", () => {
  it("is a button with a dialog popup, the dialog named by its heading", async () => {
    const { inbox } = await mount([waiting("a", "First")]);
    const badge = shadow(inbox).querySelector(".badge") as HTMLButtonElement;
    expect(badge.getAttribute("aria-haspopup")).toBe("dialog");
    await userEvent.click(badge);
    await expect.element(page.getByRole("dialog", { name: "Needs you" })).toBeVisible();
  });

  it("closes on Tab past the last row, focus going on to the next page element", async () => {
    const { inbox } = await mount([waiting("a", "First"), waiting("b", "Second")]);
    const { after } = between(inbox);
    await userEvent.click(shadow(inbox).querySelector(".badge") as HTMLElement);
    await userEvent.keyboard("{ArrowDown}");
    expect(shadow(inbox).activeElement).toBe(part(inbox, "b", ".row-main"));
    await userEvent.keyboard("{Tab}");
    expect(inbox.open).toBe(false);
    expect(document.activeElement).toBe(after);
  });

  it("stays open on Shift+Tab to its badge, and closes on Shift+Tab past it", async () => {
    const { inbox } = await mount([waiting("a", "First")]);
    const { before } = between(inbox);
    const badge = shadow(inbox).querySelector(".badge") as HTMLButtonElement;
    await userEvent.click(badge);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(shadow(inbox).activeElement).toBe(badge);
    expect(inbox.open).toBe(true);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(inbox.open).toBe(false);
    expect(document.activeElement).toBe(before);
  });

  it("is a labelled group, not a dialog, as a list", async () => {
    const { inbox } = await mount([waiting("a", "First")], "list");
    const panel = shadow(inbox).querySelector(".panel") as HTMLElement;
    expect(panel.getAttribute("role")).toBe("group");
    await expect.element(page.getByRole("group", { name: "Needs you" })).toBeVisible();
    expect(page.getByRole("dialog").elements()).toHaveLength(0);
  });
});

describe("<ag-ui-inbox variant=list> hands focus on when its row leaves in Chromium", () => {
  async function list(
    threadIds: readonly string[],
  ): Promise<{ inbox: AgUiInbox; leave: (...gone: string[]) => void }> {
    const { inbox, provider } = await mount(threadIds.map(answerable), "list");
    Object.assign(provider, { agents: [{ id: "board", name: "Board", endpoint: "/board/" }] });
    const leave = (...gone: string[]): void => {
      const rows = threadIds.filter((id) => !gone.includes(id)).map(answerable);
      Object.assign(provider, { inbox: rows });
      provider.dispatchEvent(new CustomEvent(INBOX_CHANGE_EVENT));
    };
    provider.dispatchEvent(new CustomEvent(INBOX_CHANGE_EVENT));
    return { inbox, leave };
  }

  it("moves to the row that took the place of the middle one, answered by Approve", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("", { status: 200 })));
    const { inbox, leave } = await list(["a", "b", "c"]);
    part(inbox, "b", ".approve").focus();
    await userEvent.keyboard("{Enter}");
    await new Promise((resolve) => setTimeout(resolve, 20));
    leave("b");
    expect(shadow(inbox).activeElement).toBe(part(inbox, "c", ".row-main"));
  });

  it("moves to the previous row when the last one leaves", async () => {
    const { inbox, leave } = await list(["a", "b", "c"]);
    part(inbox, "c", ".row-main").focus();
    leave("c");
    expect(shadow(inbox).activeElement).toBe(part(inbox, "b", ".row-main"));
  });

  it("moves to the list itself when the only row leaves", async () => {
    const { inbox, leave } = await list(["a"]);
    part(inbox, "a", ".row-main").focus();
    leave("a");
    expect(shadow(inbox).activeElement).toBe(shadow(inbox).querySelector(".panel"));
    expect(document.activeElement).toBe(inbox);
  });
});
