import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiAgents } from "../src/agents/ag_ui_agents.js";
import { defineAgents } from "../src/agents/define_agents.js";
import { AGENTS_TAG } from "../src/constants.js";
import {
  type AgUiInbox,
  defineInbox,
  INBOX_SELECT_EVENT,
  INBOX_TAG,
  type InboxSelectDetail,
} from "../src/inbox.js";

defineAgents();
defineInbox();

// Interrupts as django-ag-ui's `thread_status_fields` encodes them: one per kind.
const ARCHIVE = {
  id: "int-call-1",
  reason: "tool_call",
  message: "Archive the board?",
  toolCallId: "call-1",
  metadata: { destructive: false, kind: "approval" },
};
const DELETE = {
  id: "int-call-2",
  reason: "tool_call",
  message: "Delete the invoice?",
  toolCallId: "call-2",
  metadata: { destructive: true, kind: "approval" },
};
const QUESTION = {
  id: "int-call-3",
  reason: "tool_call",
  message: "Which board?",
  toolCallId: "call-3",
  metadata: { destructive: false, kind: "question" },
};
const EXTERNAL = {
  id: "int-call-4",
  reason: "tool_call",
  message: "pick_file",
  toolCallId: "call-4",
  metadata: { destructive: false, kind: "external" },
};

const DIRECTORY = "/home/agents/";
const INBOX = "/home/inbox/";

function row(id: string, agent: string, extra: object): object {
  return {
    thread_id: id,
    agent_id: agent,
    title: `Thread ${id}`,
    updated_at: "2026-11-23T10:00:00+00:00",
    preview: "",
    last_read_at: null,
    ...extra,
  };
}

const ROWS = [
  row("a", "board", { status: "waiting", interrupts: [ARCHIVE] }),
  row("b", "billing", { status: "waiting", interrupts: [DELETE, QUESTION] }),
  row("c", "board", { status: "running" }),
  row("d", "billing", { status: "failed", reason: "error" }),
  row("e", "board", { status: "waiting", interrupts: [] }),
  row("f", "notes", { status: "waiting", interrupts: [EXTERNAL] }),
  row("g", "notes", { status: "idle" }),
];

function entry(id: string, name: string): object {
  return {
    id,
    name,
    description: "",
    endpoint: `/${id}/`,
    tools_url: null,
    threads_url: `/${id}/threads/`,
    runs_url: null,
    skills_url: null,
    skill_editor_url: null,
    attachments_url: null,
    transcribe_url: null,
  };
}

function json(body: object, etag: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ETag: etag },
  });
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function serve(threads: readonly object[] = ROWS): void {
  fetchMock.mockImplementation(async (url, init) => {
    const etag = (init?.headers as Record<string, string> | undefined)?.["If-None-Match"];
    if (url === DIRECTORY) {
      return etag === undefined
        ? json({ agents: [entry("board", "Board"), entry("billing", "")] }, '"d1"')
        : new Response(null, { status: 304 });
    }
    return etag === undefined ? json({ threads }, '"i1"') : new Response(null, { status: 304 });
  });
}

function provider(id = "home"): AgUiAgents {
  const element = document.createElement(AGENTS_TAG) as AgUiAgents;
  element.id = id;
  element.setAttribute("data-agents-url", DIRECTORY);
  element.setAttribute("data-inbox-url", INBOX);
  return element;
}

function inbox(attributes: Record<string, string> = {}): AgUiInbox {
  const element = document.createElement(INBOX_TAG) as AgUiInbox;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

function shadow(element: AgUiInbox): ShadowRoot {
  return element.shadowRoot as ShadowRoot;
}

function rows(element: AgUiInbox): HTMLLIElement[] {
  return [...shadow(element).querySelectorAll<HTMLLIElement>(".row")];
}

function badge(element: AgUiInbox): HTMLButtonElement {
  return shadow(element).querySelector(".badge") as HTMLButtonElement;
}

function pick(element: AgUiInbox, index: number): void {
  (rows(element)[index] as HTMLLIElement).querySelector<HTMLButtonElement>(".row-main")?.click();
}

function panel(element: AgUiInbox): HTMLElement {
  return shadow(element).querySelector(".panel") as HTMLElement;
}

beforeEach(() => {
  document.body.replaceChildren();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("<ag-ui-inbox> rows", () => {
  it("lists only the conversations parked on the user, across agents, from the provider", async () => {
    serve();
    const home = provider();
    const list = inbox({ variant: "list" });
    home.append(list);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);

    expect(list.items.map((item) => [item.agentId, item.threadId])).toEqual([
      ["board", "a"],
      ["billing", "b"],
      ["notes", "f"],
    ]);
    expect(rows(list).map((item) => item.textContent)).toEqual([
      "Thread a · BoardApproval: Archive the board?",
      "Thread bApproval · Destructive: Delete the invoice? +1 more",
      "Thread fAction needed: pick_file",
    ]);
    expect(list.getAttribute("data-count")).toBe("3");
    expect(list.hasAttribute("data-empty")).toBe(false);
  });

  it("names a question and an unknown kind, and treats a missing destructive flag as destructive", async () => {
    serve([
      row("q", "board", { status: "waiting", interrupts: [QUESTION] }),
      row("x", "board", {
        status: "waiting",
        interrupts: [{ id: "int-x", reason: "tool_call", metadata: { kind: "approval" } }],
      }),
      row("y", "board", { status: "waiting", interrupts: [{ id: "int-y", reason: "tool_call" }] }),
      row("z", "board", {
        status: "waiting",
        interrupts: [{ id: "int-z", reason: "tool_call", metadata: "approval", message: "" }],
      }),
    ]);
    const home = provider();
    const list = inbox({ variant: "list" });
    home.append(list);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);

    const summaries = rows(list).map((item) => item.querySelector(".summary")?.textContent);
    expect(summaries).toEqual([
      "Question: Which board?",
      "Approval · Destructive",
      "Action needed",
      "Action needed",
    ]);
  });

  it("draws a title as text, and an untitled row by the strings", async () => {
    serve([
      row("h", "board", { status: "waiting", interrupts: [ARCHIVE], title: "<img src=x>" }),
      row("u", "board", { status: "waiting", interrupts: [ARCHIVE], title: "" }),
    ]);
    const home = provider();
    const list = inbox({ variant: "list" });
    home.append(list);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);

    expect(shadow(list).querySelector("img")).toBeNull();
    expect(rows(list)[0]?.querySelector(".title")?.firstChild?.textContent).toBe("<img src=x>");
    expect(rows(list)[1]?.querySelector(".title")?.firstChild?.textContent).toBe(
      "New conversation",
    );
  });

  it("follows the provider's inbox as it changes, by polling", async () => {
    serve([row("a", "board", { status: "waiting", interrupts: [ARCHIVE] })]);
    const home = provider();
    const list = inbox({ variant: "list" });
    home.append(list);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    expect(list.items).toHaveLength(1);

    serve([]);
    fetchMock.mockImplementation(async (url) =>
      url === INBOX ? json({ threads: [] }, '"i2"') : new Response(null, { status: 304 }),
    );
    await vi.advanceTimersByTimeAsync(5000);

    expect(list.items).toEqual([]);
    expect(rows(list)).toEqual([]);
    expect(list.hasAttribute("data-empty")).toBe(true);
    const empty = shadow(list).querySelector(".empty") as HTMLElement;
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe("Nothing needs you");
  });

  it("follows the provider's inbox by its SSE stream", async () => {
    const frame = (threads: readonly object[], id: string): string =>
      `id: "${id}"\ndata: ${JSON.stringify({ threads })}\n\n`;
    fetchMock.mockImplementation(async (url) => {
      if (url === DIRECTORY) {
        return json({ agents: [entry("board", "Board")] }, '"d1"');
      }
      return new Response(
        frame([row("a", "board", { status: "waiting", interrupts: [ARCHIVE] })], "s1") +
          frame([row("a", "board", { status: "idle" })], "s2"),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    });
    const home = provider();
    home.setAttribute("data-inbox-transport", "stream");
    const seen: number[] = [];
    const list = inbox();
    document.addEventListener("ag-ui-inbox-change", () => seen.push(list.items.length));
    home.append(list);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);

    expect(seen).toEqual([1, 0]);
    expect(fetchMock.mock.calls.find(([url]) => url === INBOX)?.[1]?.headers).toEqual({
      Accept: "text/event-stream",
    });
  });
});

describe("<ag-ui-inbox> binding", () => {
  it("binds to the provider named by agents, outside it, even when the provider comes later", async () => {
    serve();
    const badgeOnly = inbox({ agents: "home" });
    document.body.append(badgeOnly);
    expect(badgeOnly.provider).toBeNull();
    expect(badgeOnly.items).toEqual([]);

    const home = provider();
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);

    expect(badgeOnly.provider).toBe(home);
    expect(badgeOnly.items).toHaveLength(3);
    expect(shadow(badgeOnly).querySelector(".count")?.textContent).toBe("3");
    expect(badge(badgeOnly).getAttribute("aria-label")).toBe("Needs you: 3");
  });

  it("takes a provider set by property over agents, and lets go when removed", async () => {
    serve();
    const home = provider();
    const other = provider("other");
    document.body.append(home, other);
    await vi.advanceTimersByTimeAsync(0);
    const element = inbox({ agents: "other" });
    document.body.append(element);
    expect(element.provider).toBe(other);

    element.provider = home;
    expect(element.provider).toBe(home);
    element.provider = null;
    expect(element.provider).toBe(other);

    element.setAttribute("agents", "missing");
    expect(element.provider).toBeNull();
    expect(element.items).toEqual([]);

    element.setAttribute("agents", "home");
    element.remove();
    expect(element.provider).toBeNull();
    home.dispatchEvent(new CustomEvent("ag-ui-inbox-change"));
    expect(element.items).toEqual([]);
  });

  it("binds to no provider before it is connected", () => {
    const element = inbox();
    element.provider = null;
    expect(element.provider).toBeNull();
    expect(element.hasAttribute("data-count")).toBe(false);
    document.body.append(element);
    expect(element.getAttribute("data-count")).toBe("0");
  });
});

describe("<ag-ui-inbox> badge", () => {
  async function mounted(): Promise<{ home: AgUiAgents; element: AgUiInbox }> {
    serve();
    const home = provider();
    const element = inbox();
    home.append(element);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    return { home, element };
  }

  it("opens and closes its list from the badge, and closes on Escape with focus back", async () => {
    const { element } = await mounted();
    expect(element.variant).toBe("badge");
    expect(panel(element).hidden).toBe(true);

    badge(element).click();
    expect(element.open).toBe(true);
    expect(panel(element).hidden).toBe(false);
    expect(badge(element).getAttribute("aria-expanded")).toBe("true");
    expect(shadow(element).activeElement).toBe(rows(element)[0]?.querySelector(".row-main"));

    panel(element).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(element.open).toBe(false);
    expect(shadow(element).activeElement).toBe(badge(element));

    badge(element).click();
    badge(element).click();
    expect(element.open).toBe(false);
  });

  it("moves focus between rows with the arrow keys, wrapping, and ignores other keys", async () => {
    const { element } = await mounted();
    element.open = true;
    const buttons = rows(element).map((item) => item.querySelector(".row-main"));
    const key = (name: string): void => {
      panel(element).dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
    };

    key("ArrowDown");
    expect(shadow(element).activeElement).toBe(buttons[1]);
    key("ArrowUp");
    key("ArrowUp");
    expect(shadow(element).activeElement).toBe(buttons[2]);
    key("Tab");
    expect(shadow(element).activeElement).toBe(buttons[2]);
    element.open = false;
    key("Escape");
    expect(element.open).toBe(false);
  });

  it("does nothing on an arrow key with no rows", async () => {
    serve([]);
    const home = provider();
    const element = inbox();
    home.append(element);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    element.open = true;
    const event = new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true });
    panel(element).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(shadow(element).querySelector(".count")?.hasAttribute("hidden")).toBe(true);
  });

  it("closes on a press outside it, and not on one inside", async () => {
    const { element } = await mounted();
    element.open = true;
    panel(element).dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    expect(element.open).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(element.open).toBe(false);
  });

  it("caps the count it draws, not the count it reports", async () => {
    serve(
      Array.from({ length: 120 }, (_, index) =>
        row(`t${index}`, "board", { status: "waiting", interrupts: [ARCHIVE] }),
      ),
    );
    const home = provider();
    const element = inbox();
    home.append(element);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    expect(shadow(element).querySelector(".count")?.textContent).toBe("99+");
    expect(element.getAttribute("data-count")).toBe("120");
  });

  it("never opens as a list, closes when it becomes one, and closes when disconnected", async () => {
    const { element } = await mounted();
    element.open = true;
    element.variant = "list";
    expect(element.open).toBe(false);
    expect(badge(element).hidden).toBe(true);
    expect(panel(element).hidden).toBe(false);
    expect((shadow(element).querySelector(".heading") as HTMLElement).hidden).toBe(true);
    element.open = true;
    expect(element.open).toBe(false);

    element.variant = "badge";
    element.open = true;
    element.remove();
    expect(element.open).toBe(false);
  });

  it("translates by strings, merged over the defaults", async () => {
    const { element } = await mounted();
    element.strings = { badge: "{count} warten", more: "und {count}" };
    expect(element.strings.label).toBe("Needs you");
    expect(badge(element).getAttribute("aria-label")).toBe("3 warten");
    expect(rows(element)[1]?.textContent).toContain("und 1");
  });
});

describe("<ag-ui-inbox> picking a row", () => {
  it("opens the conversation through the provider and closes the badge's list", async () => {
    serve();
    const home = provider();
    const element = inbox();
    home.append(element);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    const opened = vi.spyOn(home, "openThread").mockResolvedValue(undefined);
    const picked: InboxSelectDetail[] = [];
    document.addEventListener(INBOX_SELECT_EVENT, (event) =>
      picked.push((event as CustomEvent<InboxSelectDetail>).detail),
    );
    element.open = true;

    pick(element, 1);

    expect(picked).toEqual([{ agentId: "billing", threadId: "b" }]);
    expect(opened).toHaveBeenCalledWith("billing", "b");
    expect(element.open).toBe(false);
  });

  it("leaves the provider alone when the host prevents the select, and swallows a failed open", async () => {
    serve();
    const home = provider();
    const element = inbox({ variant: "list" });
    home.append(element);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    const opened = vi.spyOn(home, "openThread").mockRejectedValue(new Error("gone"));
    const prevent = (event: Event): void => event.preventDefault();
    element.addEventListener(INBOX_SELECT_EVENT, prevent);

    pick(element, 0);
    expect(opened).not.toHaveBeenCalled();

    element.removeEventListener(INBOX_SELECT_EVENT, prevent);
    pick(element, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toHaveBeenCalledWith("board", "a");
  });
});
