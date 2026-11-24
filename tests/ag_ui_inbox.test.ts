import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiAgents } from "../src/agents/ag_ui_agents.js";
import { defineAgents } from "../src/agents/define_agents.js";
import { AGENTS_TAG } from "../src/constants.js";
import {
  type AgUiInbox,
  defineInbox,
  INBOX_ANSWER_EVENT,
  INBOX_SELECT_EVENT,
  INBOX_TAG,
  type InboxAnswerDetail,
  type InboxProvider,
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

  it("summarises an approval by its x-confirm prompt, and by its message without one", async () => {
    const call = { id: "int-c", reason: "tool_call", toolCallId: "c" };
    serve([
      row("p", "board", {
        status: "waiting",
        interrupts: [
          {
            ...call,
            message: "Approve discard_book({'id': 7})?",
            metadata: { destructive: false, kind: "approval", "x-confirm": "Discard this book?" },
          },
        ],
      }),
      row("b", "board", {
        status: "waiting",
        interrupts: [
          {
            ...call,
            message: "Approve discard_book({'id': 8})?",
            metadata: { destructive: false, kind: "approval", "x-confirm": "  " },
          },
        ],
      }),
      row("n", "board", {
        status: "waiting",
        interrupts: [
          {
            ...call,
            message: "Approve discard_book({'id': 9})?",
            metadata: { destructive: false, kind: "approval", "x-confirm": 7 },
          },
        ],
      }),
      row("m", "board", { status: "waiting", interrupts: [ARCHIVE] }),
    ]);
    const home = provider();
    const list = inbox({ variant: "list" });
    home.append(list);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);

    const summaries = rows(list).map((item) => item.querySelector(".summary")?.textContent);
    expect(summaries).toEqual([
      "Approval: Discard this book?",
      "Approval: Approve discard_book({'id': 8})?",
      "Approval: Approve discard_book({'id': 9})?",
      "Approval: Archive the board?",
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

  it("binds the provider that takes the id of the one it was bound to once that one leaves", async () => {
    serve();
    const badgeOnly = inbox({ agents: "home" });
    const home = provider();
    document.body.append(badgeOnly, home);
    await vi.advanceTimersByTimeAsync(0);
    home.remove();
    const next = provider();
    document.body.append(next);
    await vi.advanceTimersByTimeAsync(0);

    expect(badgeOnly.provider).toBe(next);
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

  it("takes the panel out of the tab order again when a list becomes a badge", async () => {
    const { element } = await mounted();
    element.variant = "list";
    expect(panel(element).getAttribute("tabindex")).toBe("-1");
    element.variant = "badge";
    expect(panel(element).hasAttribute("tabindex")).toBe(false);
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

const ARCHIVE_TOO = {
  ...ARCHIVE,
  id: "int-call-5",
  toolCallId: "call-5",
  message: "Archive it too?",
};
const UNFLAGGED = {
  ...ARCHIVE,
  id: "int-call-6",
  toolCallId: "call-6",
  metadata: { kind: "approval" },
};

const ANSWER_ROWS = [
  row("a", "board", { status: "waiting", interrupts: [ARCHIVE, ARCHIVE_TOO], run_id: "run-a" }),
  row("b", "board", { status: "waiting", interrupts: [ARCHIVE, DELETE], run_id: "run-b" }),
  row("c", "board", { status: "waiting", interrupts: [ARCHIVE] }),
  row("d", "board", { status: "waiting", interrupts: [UNFLAGGED], run_id: "run-d" }),
  row("e", "board", { status: "waiting", interrupts: [QUESTION], run_id: "run-e" }),
  row("f", "nowhere", { status: "waiting", interrupts: [ARCHIVE], run_id: "run-f" }),
  row("g", "billing", { status: "waiting", interrupts: [ARCHIVE], run_id: "run-g" }),
];

/** Serve the directory and inbox, and answer each POST with the next of `answers`. */
function serveAnswers(answers: (Response | Error)[]): { posts: [string, RequestInit][] } {
  serve(ANSWER_ROWS);
  const listed = fetchMock.getMockImplementation() as (
    url: string,
    init?: RequestInit,
  ) => Promise<Response>;
  const posts: [string, RequestInit][] = [];
  fetchMock.mockImplementation(async (url, init) => {
    if (init?.method !== "POST") {
      return listed(url, init);
    }
    posts.push([String(url), init]);
    const next = answers.shift() as Response | Error;
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });
  return { posts };
}

async function mountAnswering(answers: (Response | Error)[]) {
  const sent = serveAnswers(answers);
  const home = provider();
  home.setAttribute("credentials", "include");
  home.headers = { "X-CSRFToken": "static", "X-Both": "static" };
  home.getHeaders = () => ({ "X-Both": "live" });
  const list = inbox({ variant: "list" });
  home.append(list);
  document.body.append(home);
  await vi.advanceTimersByTimeAsync(0);
  const answered: InboxAnswerDetail[] = [];
  document.addEventListener(INBOX_ANSWER_EVENT, (event) =>
    answered.push((event as CustomEvent<InboxAnswerDetail>).detail),
  );
  return { home, list, answered, ...sent };
}

function action(list: AgUiInbox, threadId: string, name: "approve" | "deny"): HTMLButtonElement {
  return shadow(list).querySelector(
    `.row[data-thread-id="${threadId}"] .${name}`,
  ) as HTMLButtonElement;
}

function sse(status = 200): Response {
  return new Response("data: {}\n\n", { status, headers: { "content-type": "text/event-stream" } });
}

describe("<ag-ui-inbox> answering in place", () => {
  it("offers Approve and Deny only on a named run whose every call is a safe approval", async () => {
    const { list } = await mountAnswering([]);
    const offered = rows(list).map((item) => item.querySelector(".actions") !== null);
    // a: two safe approvals. b: one destructive. c: no run id (an older server).
    // d: no destructive flag. e: a question. f: an agent the directory does not list.
    expect(offered).toEqual([true, false, false, false, false, false, true]);
    expect(action(list, "a", "approve").textContent).toBe("Approve");
    expect(action(list, "a", "deny").textContent).toBe("Deny");
  });

  it("approves every call at once on the mount's resume/<run_id>/, detached, with the provider's headers", async () => {
    const { list, posts, answered } = await mountAnswering([sse()]);
    action(list, "a", "approve").click();
    action(list, "a", "approve").click();
    expect(action(list, "a", "approve").disabled).toBe(true);
    expect(action(list, "a", "deny").disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(posts).toHaveLength(1);
    const [url, init] = posts[0] as [string, RequestInit];
    expect(url).toBe(new URL("/board/resume/run-a/", location.href).href);
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({
      "X-CSRFToken": "static",
      "X-Both": "live",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    });
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      threadId: "a",
      runId: expect.any(String),
      state: {},
      messages: [],
      tools: [],
      context: [],
      forwardedProps: { detach: true },
      resume: [
        { interruptId: "int-call-1", status: "resolved", payload: { approved: true } },
        { interruptId: "int-call-5", status: "resolved", payload: { approved: true } },
      ],
    });
    expect(body.runId).not.toBe("run-a");
    expect(answered).toEqual([
      {
        agentId: "board",
        threadId: "a",
        runId: "run-a",
        approved: true,
        outcome: "answered",
        status: 200,
      },
    ]);
    expect(action(list, "a", "approve").disabled).toBe(true);
  });

  it("denies every call as cancelled", async () => {
    const { list, posts, answered } = await mountAnswering([sse()]);
    action(list, "a", "deny").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse((posts[0] as [string, RequestInit])[1].body as string).resume).toEqual([
      { interruptId: "int-call-1", status: "cancelled" },
      { interruptId: "int-call-5", status: "cancelled" },
    ]);
    expect(answered.map((detail) => [detail.approved, detail.outcome])).toEqual([
      [false, "answered"],
    ]);
  });

  it("reads a 409 or 404 as answered elsewhere, and keeps the row's actions off", async () => {
    const { list, answered } = await mountAnswering([
      new Response("{}", { status: 409 }),
      new Response("{}", { status: 404 }),
    ]);
    action(list, "a", "approve").click();
    await vi.advanceTimersByTimeAsync(0);
    action(list, "g", "approve").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(answered.map((detail) => [detail.threadId, detail.outcome, detail.status])).toEqual([
      ["a", "elsewhere", 409],
      ["g", "elsewhere", 404],
    ]);
    expect(action(list, "a", "approve").disabled).toBe(true);
    expect(shadow(list).querySelector(".answer-error")).toBeNull();
  });

  it("says a failed answer failed, lets it be sent again, and clears the line when it goes through", async () => {
    const { list, answered } = await mountAnswering([
      new Response("{}", { status: 500 }),
      new TypeError("offline"),
      sse(),
    ]);
    action(list, "a", "approve").click();
    await vi.advanceTimersByTimeAsync(0);
    const error = shadow(list).querySelector('.row[data-thread-id="a"] .answer-error');
    expect(error?.textContent).toBe(
      "Could not send the answer. Open the conversation to answer there.",
    );
    expect(error?.getAttribute("role")).toBe("status");
    expect(action(list, "a", "approve").disabled).toBe(false);

    action(list, "a", "approve").click();
    await vi.advanceTimersByTimeAsync(0);
    action(list, "a", "deny").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(answered.map((detail) => [detail.outcome, detail.status])).toEqual([
      ["failed", 500],
      ["failed", 0],
      ["answered", 200],
    ]);
    expect(shadow(list).querySelector(".answer-error")).toBeNull();
  });

  it("forgets an answer once its row leaves the inbox", async () => {
    const { home, list } = await mountAnswering([new Response("{}", { status: 500 }), sse()]);
    action(list, "a", "approve").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(shadow(list).querySelector(".answer-error")).not.toBeNull();
    Object.defineProperty(home, "inbox", { value: [], configurable: true });
    home.dispatchEvent(new CustomEvent("ag-ui-inbox-change"));
    delete (home as { inbox?: unknown }).inbox;
    home.dispatchEvent(new CustomEvent("ag-ui-inbox-change"));
    expect(shadow(list).querySelector(".answer-error")).toBeNull();
    action(list, "a", "approve").click();
    expect(action(list, "a", "approve").disabled).toBe(true);
  });

  it("keeps an answered row off while the inbox still lists it, and sends no credentials it was not given", async () => {
    const broken = {
      status: 200,
      text: () => Promise.reject(new Error("stream cut")),
    } as unknown as Response;
    serveAnswers([broken]);
    const home = provider();
    const list = inbox({ variant: "list" });
    home.append(list);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    action(list, "a", "approve").click();
    await vi.advanceTimersByTimeAsync(0);
    const [, init] = fetchMock.mock.calls.find(([, sent]) => sent?.method === "POST") as [
      string,
      RequestInit,
    ];
    expect("credentials" in init).toBe(false);
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    });
    home.dispatchEvent(new CustomEvent("ag-ui-inbox-change"));
    expect(action(list, "a", "approve").disabled).toBe(true);
  });

  it("sends nothing from a stale button once its agent left the directory", async () => {
    const { home, list, posts } = await mountAnswering([]);
    const stale = action(list, "a", "approve");
    vi.spyOn(home, "agents", "get").mockReturnValue([]);
    stale.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(posts).toEqual([]);
    expect(stale.disabled).toBe(false);
  });

  it("mints the resume's run id outside a secure context, where crypto has no randomUUID", async () => {
    const { list, posts, answered } = await mountAnswering([sse()]);
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    action(list, "a", "approve").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(posts).toHaveLength(1);
    const body = JSON.parse((posts[0] as [string, RequestInit])[1].body as string);
    expect(body.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(answered.map((detail) => detail.outcome)).toEqual(["answered"]);
  });

  it("posts to resume/<run_id>/ under an endpoint with no trailing slash", async () => {
    const { home, list, posts } = await mountAnswering([sse()]);
    const [board, ...rest] = home.agents;
    vi.spyOn(home, "agents", "get").mockReturnValue([
      { ...(board as object), endpoint: "/board" },
      ...rest,
    ] as typeof home.agents);
    action(list, "a", "approve").click();
    await vi.advanceTimersByTimeAsync(0);
    expect((posts[0] as [string, RequestInit])[0]).toBe(
      new URL("/board/resume/run-a/", location.href).href,
    );
  });

  it("sends nothing from a row left over once the inbox lost its provider", async () => {
    const { list, posts } = await mountAnswering([]);
    const stale = action(list, "a", "approve");
    list.remove();
    stale.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(posts).toEqual([]);
  });

  it("hands on a waiting row's run id, and none for a row not waiting", async () => {
    serve([
      row("a", "board", { status: "waiting", interrupts: [ARCHIVE], run_id: "run-a" }),
      row("b", "board", { status: "running", run_id: "run-b" }),
      row("c", "board", { status: "waiting", interrupts: [ARCHIVE] }),
    ]);
    const home = provider();
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    expect(home.inbox.map((item) => item.runId)).toEqual(["run-a", undefined, undefined]);
    expect("runId" in (home.inbox[1] as object)).toBe(false);
  });
});

describe("<ag-ui-inbox> surviving mutants", () => {
  it("lets Escape through to the host when nothing is open", async () => {
    serve();
    const home = provider();
    const list = inbox({ variant: "list" });
    home.append(list);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    const heard = vi.fn();
    document.addEventListener("keydown", heard);
    (rows(list)[0] as HTMLLIElement)
      .querySelector(".row-main")
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
      );
    badge(list).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    document.removeEventListener("keydown", heard);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(list.open).toBe(false);
  });

  it("closes on Escape pressed on the badge, and keeps the key from the host", async () => {
    serve();
    const home = provider();
    const element = inbox();
    home.append(element);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    const heard = vi.fn();
    document.addEventListener("keydown", heard);
    badge(element).click();
    badge(element).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    document.removeEventListener("keydown", heard);
    expect(element.open).toBe(false);
    expect(shadow(element).activeElement).toBe(badge(element));
    expect(heard).not.toHaveBeenCalled();
  });

  it("lists no row whose status is not waiting, interrupts or not, from a provider set by property", () => {
    const element = document.createElement("div") as unknown as InboxProvider;
    Object.assign(element, {
      agents: [],
      openThread: () => Promise.resolve(),
      inbox: [
        {
          threadId: "a",
          agentId: "board",
          title: "",
          updatedAt: 0,
          preview: "",
          status: "waiting",
          interrupts: [ARCHIVE],
        },
        {
          threadId: "b",
          agentId: "board",
          title: "",
          updatedAt: 0,
          preview: "",
          status: "running",
          interrupts: [ARCHIVE],
        },
      ],
    });
    const list = inbox({ variant: "list" });
    document.body.append(list);
    list.provider = element;
    expect(list.items.map((item) => item.threadId)).toEqual(["a"]);
  });

  it("names no run on a waiting row the server gave none", async () => {
    serve([
      row("a", "board", { status: "waiting", interrupts: [ARCHIVE], run_id: "run-a" }),
      row("c", "board", { status: "waiting", interrupts: [ARCHIVE] }),
    ]);
    const home = provider();
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    expect("runId" in (home.inbox[0] as object)).toBe(true);
    expect("runId" in (home.inbox[1] as object)).toBe(false);
  });
});

describe("<ag-ui-inbox> answering with an async header source", () => {
  async function mountWith(
    getHeaders: () => Promise<Record<string, string>>,
    answers: (Response | Error)[],
  ) {
    const sent = serveAnswers(answers);
    const home = provider();
    home.headers = { "X-CSRFToken": "static" };
    let listing = true;
    home.getHeaders = () => (listing ? Promise.resolve({}) : getHeaders());
    const list = inbox({ variant: "list" });
    home.append(list);
    document.body.append(home);
    await vi.advanceTimersByTimeAsync(0);
    listing = false;
    const answered: InboxAnswerDetail[] = [];
    document.addEventListener(INBOX_ANSWER_EVENT, (event) =>
      answered.push((event as CustomEvent<InboxAnswerDetail>).detail),
    );
    return { list, answered, ...sent };
  }

  it("sends the resolved header on the answer, not a spread Promise", async () => {
    const { list, posts } = await mountWith(async () => ({ Authorization: "Bearer t" }), [sse()]);
    action(list, "a", "approve").click();
    await vi.advanceTimersByTimeAsync(0);

    expect((posts[0] as [string, RequestInit])[1].headers).toEqual({
      "X-CSRFToken": "static",
      Authorization: "Bearer t",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    });
  });

  it("reads a rejected source as a failed answer, sending nothing", async () => {
    const { list, posts, answered } = await mountWith(
      () => Promise.reject(new Error("refresh failed")),
      [],
    );
    action(list, "a", "approve").click();
    await vi.advanceTimersByTimeAsync(0);

    expect(posts).toEqual([]);
    expect(answered.map((detail) => [detail.outcome, detail.status])).toEqual([["failed", 0]]);
    expect(action(list, "a", "approve").disabled).toBe(false);
  });
});
