import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import recorded from "./fixtures/routines.json";

const ROUTINES_URL = "/agent/routines/";
const { answers } = recorded;
type Entry = (typeof answers.created.body & Record<string, unknown>) | Record<string, unknown>;

interface Seen {
  readonly url: string;
  readonly method: string;
  readonly csrf: string | null;
  readonly body: Record<string, unknown> | null;
}

/** The routines editor on `fetch`, answering as django-ag-ui's view does, and the agent. */
class FakeServer {
  routines: Entry[] = [];
  grantable: { name: string; destructive: boolean }[] = [...answers.list.body.grantable];
  runs = new Map<string, unknown[]>();
  readonly seen: Seen[] = [];
  refuse: { status: number; body: unknown } | null = null;
  refuseList = false;
  hold: Promise<void> | null = null;
  holdRuns: Promise<void> | null = null;
  #next = 10;

  install(): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init: RequestInit = {}) => this.#handle(input, init)),
    );
  }

  async #handle(url: string, init: RequestInit): Promise<Response> {
    const method = init.method ?? "GET";
    const csrf = new Headers(init.headers).get("X-CSRFToken");
    const body =
      typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    this.seen.push({ url, method, csrf, body });
    if (url === "/agent/") {
      const frames = [
        { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
        { type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "Noted." },
        { type: "TEXT_MESSAGE_END", messageId: "m1" },
        { type: "RUN_FINISHED", threadId: "t1", runId: "r1" },
      ]
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join("");
      return new Response(frames, { headers: { "Content-Type": "text/event-stream" } });
    }
    if (!url.startsWith(ROUTINES_URL)) {
      return json(404, {});
    }
    if (this.hold !== null) {
      await this.hold;
    }
    const [id, action] = url.slice(ROUTINES_URL.length).split("/");
    if (method === "GET" && id === "") {
      return this.refuseList
        ? json(500, { error: "boom" })
        : json(200, { routines: this.routines, grantable: this.grantable });
    }
    if (action === "runs") {
      if (this.holdRuns !== null) {
        await this.holdRuns;
      }
      if (this.refuseList) {
        return json(500, { error: "boom" });
      }
      return json(200, { runs: this.runs.get(id as string) ?? [] });
    }
    if (this.refuse !== null) {
      return json(this.refuse.status, this.refuse.body);
    }
    if (action === "run") {
      return json(202, { runId: "run-9", threadId: `fired-${id}` });
    }
    const draft = body as Record<string, unknown>;
    const pinned = (names: unknown) =>
      (names as string[]).map((name) => ({
        name,
        destructive: this.grantable.find((tool) => tool.name === name)?.destructive ?? true,
      }));
    if (method === "POST") {
      const entry = {
        ...answers.created.body,
        ...draft,
        id: String(this.#next++),
        preapprovedTools: pinned(draft["preapprovedTools"]),
      };
      this.routines.push(entry);
      return json(201, entry);
    }
    const index = this.routines.findIndex((routine) => routine["id"] === id);
    const current = this.routines[index] as Entry;
    const next =
      method === "PUT"
        ? { ...current, ...draft, preapprovedTools: pinned(draft["preapprovedTools"]) }
        : {
            ...current,
            enabled: draft["enabled"] === true,
            nextFireAt: draft["enabled"] === true ? answers.created.body.nextFireAt : null,
          };
    this.routines[index] = next;
    return json(200, next);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
}

function shadow(el: AgUiChat): ShadowRoot {
  return el.shadowRoot as ShadowRoot;
}

function q<T extends Element>(el: AgUiChat, selector: string): T {
  const found = shadow(el).querySelector<T>(selector);
  if (found === null) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

function all(el: AgUiChat, selector: string): string[] {
  return [...shadow(el).querySelectorAll(selector)].map((node) => node.textContent ?? "");
}

function button(el: AgUiChat, text: string, within = ".panel-view"): HTMLButtonElement {
  const found = [...shadow(el).querySelectorAll<HTMLButtonElement>(`${within} button`)].find(
    (candidate) => candidate.textContent === text,
  );
  if (found === undefined) {
    throw new Error(`expected a button "${text}"`);
  }
  return found;
}

function tool(el: AgUiChat, name: string): HTMLInputElement {
  return q<HTMLInputElement>(el, `.routine-tool input[name="${name}"]`);
}

function toggle(box: HTMLInputElement): void {
  box.checked = !box.checked;
  box.dispatchEvent(new Event("change"));
}

function writes(): Seen[] {
  return server.seen.filter((seen) => seen.method !== "GET" && seen.url !== "/agent/");
}

let server: FakeServer;

function mount(attrs: Record<string, string> = { "data-routines-url": ROUTINES_URL }): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  el.getHeaders = () => ({ "X-CSRFToken": "token-1" });
  document.body.appendChild(el);
  return el;
}

const STANDUP = answers.list.body.routines[0] as Entry;
const CLEANUP = answers.list.body.routines[1] as Entry;

describe("the routines view in <ag-ui-chat>", () => {
  beforeAll(() => {
    defineChat();
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    server = new FakeServer();
    server.install();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers no Routines control and opens nothing without data-routines-url, or with it empty", async () => {
    for (const attrs of [{}, { "data-routines-url": "" }]) {
      const el = mount(attrs);
      await flush();
      expect(shadow(el).querySelector(".header-btn--routines")).toBeNull();
      el.openRoutines();
      el.makeRoutine();
      await flush();
      expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(true);
      expect(server.seen.filter((seen) => seen.url.startsWith(ROUTINES_URL))).toEqual([]);
      el.remove();
    }
  });

  it("lists each routine with its schedule in words, next run and last result, from the header", async () => {
    server.routines = [{ ...STANDUP }, { ...CLEANUP, enabled: false, nextFireAt: null }];
    server.runs.set("1", answers.runsFinished.body.runs);
    const el = mount();
    await flush();
    const control = q<HTMLButtonElement>(el, ".header-btn--routines");
    expect(control.getAttribute("aria-label")).toBe("Routines");
    control.click();
    await flush();

    expect(q(el, ".panel-view-title").textContent).toBe("Routines");
    expect(q(el, ".panel-view-sub").textContent).toBe("2");
    expect(all(el, ".routine-row-name")).toEqual(["standup", "cleanup"]);
    expect(all(el, ".routine-schedule")[1]).toMatch(/^Every 6 hours/);
    const [next, paused] = all(el, ".routine-next");
    expect(next).toMatch(/^Next /);
    expect(paused).toBe("Paused");
    expect(all(el, ".routine-last")).toEqual(["Finished", "Not run yet"]);
    expect(all(el, ".routine-row [part='routine-toggle']")).toEqual(["Pause", "Resume"]);
    expect(all(el, ".routine-row [part='routine-run']")).toEqual(["Run now", "Run now"]);
    expect(
      server.seen.filter((seen) => seen.url.endsWith("/runs/")).map((seen) => seen.url),
    ).toEqual(["/agent/routines/1/runs/", "/agent/routines/2/runs/"]);
  });

  it("says why the sweep paused a routine, and Ran when the queue no longer knows the firing", async () => {
    server.routines = [
      { ...STANDUP, enabled: false, nextFireAt: null, pausedReason: "It kept failing." },
    ];
    server.runs.set("1", [{ runId: null, threadId: "old", state: null }]);
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    expect(all(el, ".routine-next")).toEqual(["Paused: It kept failing."]);
    expect(all(el, ".routine-last")).toEqual(["Ran"]);
  });

  it("reads Lapsed and Running from the last firing, and Ran from a thread the routine records", async () => {
    server.routines = [
      { ...STANDUP, id: "1" },
      { ...STANDUP, id: "2" },
      { ...STANDUP, id: "3" },
    ];
    server.runs.set("1", [{ runId: "r", threadId: null, state: "lapsed" }]);
    server.runs.set("2", [{ runId: "r", threadId: "t", state: "pending" }]);
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    expect(all(el, ".routine-last")).toEqual(["Lapsed", "Running", "Ran"]);
  });

  it("opens the thread of the last run, leaving the view", async () => {
    server.routines = [{ ...STANDUP }];
    server.runs.set("1", answers.runsFinished.body.runs);
    const el = mount();
    await flush();
    const switched = vi.spyOn(el, "switchThread").mockRejectedValue(new Error("gone"));
    el.openRoutines();
    await flush();
    button(el, "Finished").click();
    await flush();
    expect(switched).toHaveBeenCalledWith(answers.ranNow.body.threadId);
    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(true);
  });

  it("pauses and resumes with a PATCH carrying the live CSRF header, and says so", async () => {
    server.routines = [{ ...STANDUP }, { ...CLEANUP }];
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    button(el, "Pause").click();
    await flush();
    expect(writes()).toEqual([
      { url: "/agent/routines/1/", method: "PATCH", csrf: "token-1", body: { enabled: false } },
    ]);
    expect(all(el, ".routine-next")[0]).toBe("Paused");
    expect(all(el, ".routine-row-name")).toEqual(["standup", "cleanup"]);
    expect(q(el, ".panel-view-status").textContent).toBe("standup is paused");
    button(el, "Resume").click();
    await flush();
    expect(q(el, ".panel-view-status").textContent).toBe("standup is on again");
    expect(all(el, ".routine-next")[0]).toMatch(/^Next /);
  });

  it("runs a routine now, shows it running, and says why a refused run did not start", async () => {
    server.routines = [{ ...STANDUP }];
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    button(el, "Run now").click();
    await flush();
    expect(writes().map((seen) => [seen.url, seen.method, seen.csrf, seen.body])).toEqual([
      ["/agent/routines/1/run/", "POST", "token-1", {}],
    ]);
    expect(all(el, ".routine-last")).toEqual(["Running"]);
    expect(q(el, ".panel-view-status").textContent).toBe("standup is running");

    server.refuse = answers.busy;
    button(el, "Run now").click();
    await flush();
    expect(q(el, ".panel-view-status").textContent).toBe(answers.busy.body.error);
    server.refuse = { status: 500, body: {} };
    button(el, "Run now").click();
    await flush();
    expect(q(el, ".panel-view-status").textContent).toBe("The routine could not be saved.");
  });

  it("announces a refused pause in the server's words, or the fallback", async () => {
    server.routines = [{ ...STANDUP }];
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    server.refuse = { status: 403, body: { error: "Not yours." } };
    button(el, "Pause").click();
    await flush();
    expect(q(el, ".panel-view-status").textContent).toBe("Not yours.");
    server.refuse = { status: 403, body: {} };
    button(el, "Pause").click();
    await flush();
    expect(q(el, ".panel-view-status").textContent).toBe("The routine could not be saved.");
  });

  it("creates a routine, a destructive tool granted only through a confirmation naming it destructive", async () => {
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    expect(q(el, ".skill-empty h3").textContent).toBe("No routines yet");
    q<HTMLButtonElement>(el, ".header-btn--new-routine").click();
    await flush();
    expect(q(el, ".panel-view-title").textContent).toBe("New routine");
    expect(all(el, ".routine-destructive")).toEqual(["Destructive"]);
    q<HTMLInputElement>(el, "#routine-field-name").value = "cleanup";
    q<HTMLTextAreaElement>(el, "#routine-field-prompt").value = "Drop the scratch tables.";

    const drop = tool(el, "drop_table");
    const confirm = q<HTMLElement>(
      el,
      ".routine-tool:has(input[name='drop_table']) .routine-confirm",
    );
    toggle(drop);
    expect(drop.checked).toBe(false);
    expect(confirm.hidden).toBe(false);
    expect(confirm.getAttribute("aria-label")).toBe(
      "drop_table is destructive: every run may use it without asking you. Grant it anyway?",
    );
    button(el, "Cancel", ".routine-tool:has(input[name='drop_table']) .routine-confirm").click();
    expect([drop.checked, confirm.hidden]).toEqual([false, true]);

    toggle(drop);
    button(el, "Grant", ".routine-tool:has(input[name='drop_table']) .routine-confirm").click();
    expect([drop.checked, confirm.hidden]).toEqual([true, true]);
    toggle(tool(el, "look"));
    button(el, "Create").click();
    await flush();

    const [created] = writes();
    expect(created?.csrf).toBe("token-1");
    expect(created?.body).toEqual({
      name: "cleanup",
      prompt: "Drop the scratch tables.",
      schedule: { kind: "weekly", weekdays: [0, 1, 2, 3, 4], at: "09:00" },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      enabled: true,
      preapprovedTools: ["look", "drop_table"],
      confirmDestructive: ["drop_table"],
    });
    expect(all(el, ".routine-row-name")).toEqual(["cleanup"]);
    expect(q(el, ".panel-view-status").textContent).toBe("Saved cleanup");
  });

  it("asks again for a destructive tool unticked and ticked again", async () => {
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    q<HTMLButtonElement>(el, ".header-btn--new-routine").click();
    const drop = tool(el, "drop_table");
    toggle(drop);
    button(el, "Grant", ".routine-tool:has(input[name='drop_table']) .routine-confirm").click();
    toggle(drop);
    expect(drop.checked).toBe(false);
    toggle(drop);
    expect(drop.checked).toBe(false);
    expect(
      q<HTMLElement>(el, ".routine-tool:has(input[name='drop_table']) .routine-confirm").hidden,
    ).toBe(false);
    toggle(tool(el, "look"));
    toggle(tool(el, "look"));
    button(el, "Create").click();
    await flush();
    expect(writes()[0]?.body).toMatchObject({ preapprovedTools: [], confirmDestructive: [] });
  });

  it("edits with a full PUT that names a held destructive tool again, the mount's list or not", async () => {
    server.grantable = [{ name: "look", destructive: false }];
    server.routines = [{ ...CLEANUP }];
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    q<HTMLButtonElement>(el, ".routine-row .skill-row-open").click();
    expect(q(el, ".panel-view-title").textContent).toBe("Edit routine");
    expect(q(el, ".panel-view-sub").textContent).toBe("cleanup");
    expect(all(el, ".routine-tool code")).toEqual(["look", "drop_table"]);
    expect(tool(el, "drop_table").checked).toBe(true);
    expect(q<HTMLElement>(el, ".routine-weekly").hidden).toBe(true);
    const every = q<HTMLInputElement>(el, "#routine-field-every");
    expect(every.value).toBe("6");
    every.value = "12";
    q<HTMLFormElement>(el, ".routine-form").dispatchEvent(
      new Event("submit", { cancelable: true }),
    );
    await flush();
    expect(writes()).toEqual([
      {
        url: "/agent/routines/2/",
        method: "PUT",
        csrf: "token-1",
        body: {
          name: "cleanup",
          prompt: "Run standup.",
          schedule: { kind: "interval", every_hours: 12 },
          timezone: "Europe/Paris",
          enabled: true,
          preapprovedTools: ["drop_table"],
          confirmDestructive: ["drop_table"],
        },
      },
    ]);
    expect(all(el, ".routine-schedule")[0]).toMatch(/^Every 12 hours/);
  });

  it("switches a schedule between weekly and interval, and reads the days and time ticked", async () => {
    server.routines = [{ ...STANDUP }];
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    q<HTMLButtonElement>(el, ".routine-row .skill-row-open").click();
    const [weekly, interval] = [
      ...shadow(el).querySelectorAll<HTMLInputElement>("input[name='routine-kind']"),
    ] as [HTMLInputElement, HTMLInputElement];
    expect(weekly.checked).toBe(true);
    interval.checked = true;
    interval.dispatchEvent(new Event("change"));
    expect(q<HTMLElement>(el, ".routine-weekly").hidden).toBe(true);
    expect(q<HTMLElement>(el, ".routine-interval").hidden).toBe(false);
    weekly.checked = true;
    weekly.dispatchEvent(new Event("change"));
    const days = [...shadow(el).querySelectorAll<HTMLInputElement>(".routine-day input")];
    expect(days.map((day) => day.checked)).toEqual([true, true, true, true, true, false, false]);
    expect(shadow(el).querySelectorAll("[part=routine-day]")).toHaveLength(7);
    (days[0] as HTMLInputElement).checked = false;
    (days[6] as HTMLInputElement).checked = true;
    q<HTMLSelectElement>(el, "#routine-field-at-hour").value = "07";
    q<HTMLSelectElement>(el, "#routine-field-at-minute").value = "15";
    button(el, "Save").click();
    await flush();
    expect(writes()[0]?.body?.["schedule"]).toEqual({
      kind: "weekly",
      weekdays: [1, 2, 3, 4, 6],
      at: "07:15",
    });
  });

  it("shows a refused save above the fields in the server's words, or the fallback", async () => {
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    q<HTMLButtonElement>(el, ".header-btn--new-routine").click();
    server.refuse = answers.badSchedule;
    button(el, "Create").click();
    await flush();
    const error = q<HTMLElement>(el, ".routine-form .skill-form-error");
    expect([error.hidden, error.textContent]).toEqual([false, answers.badSchedule.body.error]);
    server.refuse = { status: 400, body: {} };
    button(el, "Create").click();
    await flush();
    expect(error.textContent).toBe("The routine could not be saved.");
    expect(q(el, ".panel-view-title").textContent).toBe("New routine");
  });

  it("says when the agent has no tool to pre-approve", async () => {
    server.grantable = [];
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    q<HTMLButtonElement>(el, ".header-btn--new-routine").click();
    expect(q(el, ".routine-tools .skill-field-hint").textContent).toBe(
      "This agent has no tools to pre-approve.",
    );
    expect(shadow(el).querySelector(".routine-tool")).toBeNull();
  });

  it("says the list could not be loaded", async () => {
    server.refuseList = true;
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    expect(q(el, ".panel-view [role='alert']").textContent).toBe("Routines could not be loaded.");
  });

  it("leaves the last result as it was when the firings will not load", async () => {
    server.routines = [{ ...CLEANUP }];
    const el = mount();
    await flush();
    let release = () => {};
    server.holdRuns = new Promise<void>((resolve) => {
      release = resolve;
    });
    el.openRoutines();
    await flush();
    server.refuseList = true;
    release();
    await flush();
    expect(all(el, ".routine-last")).toEqual(["Not run yet"]);
  });

  it("makes the conversation a routine: its user messages in order, its first as the name", async () => {
    const el = mount();
    await flush();
    el.makeRoutine();
    await flush();
    expect(q(el, ".panel-view-title").textContent).toBe("Routines");
    expect(shadow(el).querySelector("[part='make-routine']")).toBeNull();
    el.closeRoutines();

    await el.sendMessage("Summarise yesterday's tickets");
    await flush();
    await el.sendMessage("  Group them by team  ");
    await flush();
    el.makeRoutine();
    await flush();
    expect(q(el, ".panel-view-title").textContent).toBe("New routine");
    expect(q<HTMLInputElement>(el, "#routine-field-name").value).toBe(
      "Summarise yesterday's tickets",
    );
    expect(q<HTMLTextAreaElement>(el, "#routine-field-prompt").value).toBe(
      "Summarise yesterday's tickets\n\nGroup them by team",
    );
    button(el, "Cancel", ".panel-view-footer").click();
    expect(q(el, ".panel-view-title").textContent).toBe("Routines");
    q<HTMLButtonElement>(el, "[part='make-routine']").click();
    expect(q<HTMLTextAreaElement>(el, "#routine-field-prompt").value).toMatch(/^Summarise/);
  });

  it("lists Make this a routine in More only with a routines URL and a prompt, and tracks the conversation", async () => {
    const item = (el: AgUiChat): HTMLButtonElement | null =>
      shadow(el).querySelector<HTMLButtonElement>(".header-menu .header-btn--make-routine");
    const el = mount();
    await flush();
    expect(item(el)).toBeNull();
    expect(shadow(el).querySelector(".header-btn--more")).toBeNull();

    await el.sendMessage("Summarise yesterday's tickets");
    await flush();
    const more = q<HTMLButtonElement>(el, ".header-btn--more");
    expect(item(el)?.getAttribute("role")).toBe("menuitem");
    expect(item(el)?.getAttribute("aria-label")).toBe("Make this a routine");

    more.focus();
    more.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(shadow(el).activeElement).toBe(item(el));
    item(el)?.click();
    await flush();
    expect(q(el, ".panel-view-title").textContent).toBe("New routine");
    expect(q<HTMLTextAreaElement>(el, "#routine-field-prompt").value).toBe(
      "Summarise yesterday's tickets",
    );
    expect(q<HTMLElement>(el, ".header-menu").hidden).toBe(true);

    el.closeRoutines();
    el.newChat();
    await flush();
    expect(item(el)).toBeNull();
    expect(shadow(el).querySelector(".header-btn--more")).toBeNull();
  });

  it("offers no Make this a routine in More without a routines URL, even with a prompt", async () => {
    const el = mount({ "data-routines-url": "" });
    await flush();
    await el.sendMessage("Hello");
    await flush();
    expect(shadow(el).querySelector(".header-btn--make-routine")).toBeNull();
    expect(shadow(el).querySelector(".header-btn--more")).toBeNull();
  });

  it("offers Make this a routine for a restored conversation and after a reconnect, and withdraws it on a thread with no prompt", async () => {
    const item = (el: AgUiChat): Element | null =>
      shadow(el).querySelector(".header-menu .header-btn--make-routine");
    const threads = new Map<string, unknown[]>([
      ["a", [{ id: "u1", role: "user", content: "Real ask" }]],
      ["b", []],
    ]);
    let active = "a";
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-routines-url", ROUTINES_URL);
    el.conversationStore = {
      threadId: () => active,
      setActiveThread: (id: string) => {
        active = id;
      },
      loadMessages: (id: string) => Promise.resolve((threads.get(id) ?? []) as never),
      saveMessages: () => {},
      loadCheckpoint: () => null,
      saveCheckpoint: () => {},
      clear: () => {},
      listThreads: () => Promise.resolve([]),
      renameThread: () => {},
    };
    document.body.appendChild(el);
    await flush();
    expect(item(el)).not.toBeNull();

    el.remove();
    document.body.appendChild(el);
    await flush();
    expect(item(el)).not.toBeNull();

    await el.switchThread("b");
    await flush();
    expect(item(el)).toBeNull();
    await el.switchThread("a");
    await flush();
    expect(item(el)).not.toBeNull();
  });

  it("seeds only the user turns that hold text, from a restored conversation", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-routines-url", ROUTINES_URL);
    const restored = [
      { id: "u1", role: "user", content: [{ type: "text", text: "Picture ask" }] },
      { id: "u2", role: "user", content: "   " },
      { id: "u3", role: "user", content: "Real ask" },
      { id: "a1", role: "assistant", content: "Seen." },
    ];
    el.conversationStore = {
      threadId: () => "t",
      setActiveThread: () => {},
      loadMessages: () => Promise.resolve(restored as never),
      saveMessages: () => {},
      loadCheckpoint: () => null,
      saveCheckpoint: () => {},
      clear: () => {},
      listThreads: () => Promise.resolve([]),
      renameThread: () => {},
    };
    document.body.appendChild(el);
    await flush();
    expect(shadow(el).textContent).toContain("Real ask");
    el.makeRoutine();
    await flush();
    expect(q<HTMLTextAreaElement>(el, "#routine-field-prompt").value).toBe("Real ask");
  });

  it("steps back from the form to the list and from the list to the composer", async () => {
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    q<HTMLButtonElement>(el, ".header-btn--new-routine").click();
    q<HTMLButtonElement>(el, ".panel-view-bar .header-btn--back").click();
    expect(q(el, ".panel-view-title").textContent).toBe("Routines");
    q<HTMLButtonElement>(el, ".panel-view-bar .header-btn--back").click();
    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(true);
    expect(shadow(el).activeElement).toBe(q(el, ".input"));
    el.closeRoutines();
    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(true);
  });

  it("gives way to the skill editor, and the skill editor to it, on one panel", async () => {
    const el = mount({
      "data-routines-url": ROUTINES_URL,
      "data-skill-editor-url": "/agent/skills/editor/",
    });
    await flush();
    el.openRoutines();
    await flush();
    el.openSkillEditor();
    await flush();
    expect(
      shadow(el).querySelector(".routine-row, .routine-form, [part='routine-empty']"),
    ).toBeNull();
    q<HTMLButtonElement>(el, ".panel-view-bar .header-btn--back").click();
    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(true);
    el.openRoutines();
    await flush();
    expect(q(el, ".panel-view-title").textContent).toBe("Routines");
    el.closeSkillEditor();
    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(false);
  });

  it("drops a list, a run's state and a write that land after the view was left", async () => {
    server.routines = [{ ...STANDUP }];
    let release = () => {};
    server.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    el.newChat();
    release();
    await flush();
    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(true);

    server.hold = null;
    el.openRoutines();
    await flush();
    for (const name of ["Pause", "Run now"]) {
      server.hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      button(el, name).click();
      el.closeRoutines();
      release();
      await flush();
      expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(true);
      server.hold = null;
      el.openRoutines();
      await flush();
    }
    q<HTMLButtonElement>(el, ".routine-row .skill-row-open").click();
    server.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    button(el, "Save").click();
    el.closeRoutines();
    release();
    await flush();
    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(true);
  });

  it("keeps the form when a firing's state lands while it is open", async () => {
    server.routines = [{ ...STANDUP }];
    server.runs.set("1", answers.runsPending.body.runs);
    let release = () => {};
    server.holdRuns = new Promise<void>((resolve) => {
      release = resolve;
    });
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    q<HTMLButtonElement>(el, ".routine-row .skill-row-open").click();
    release();
    await flush();
    expect(q(el, ".panel-view-title").textContent).toBe("Edit routine");
    button(el, "Cancel", ".panel-view-footer").click();
    expect(all(el, ".routine-last")).toEqual(["Running"]);
  });
  it("keeps an open form when a Run now answer lands", async () => {
    server.routines = [{ ...STANDUP }];
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    let release = () => {};
    server.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    q<HTMLButtonElement>(el, ".routine-row [part=routine-run]").click();
    q<HTMLButtonElement>(el, ".routine-row .skill-row-open").click();
    expect(q(el, ".panel-view-title").textContent).toBe("Edit routine");
    release();
    await flush();
    expect(q(el, ".panel-view-title").textContent).toBe("Edit routine");
  });

  it("opens the list, not a seeded form, on openRoutines after a conversation", async () => {
    server.routines = [{ ...STANDUP }];
    const el = mount();
    await flush();
    await el.sendMessage("check the build");
    await flush();
    el.openRoutines();
    await flush();
    expect(q(el, ".panel-view-title").textContent).toBe("Routines");
  });
  it("keeps an open form when a Pause answer lands", async () => {
    server.routines = [{ ...STANDUP }];
    const el = mount();
    await flush();
    el.openRoutines();
    await flush();
    let release = () => {};
    server.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    q<HTMLButtonElement>(el, ".routine-row [part=routine-toggle]").click();
    q<HTMLButtonElement>(el, ".routine-row .skill-row-open").click();
    expect(q(el, ".panel-view-title").textContent).toBe("Edit routine");
    release();
    await flush();
    expect(q(el, ".panel-view-title").textContent).toBe("Edit routine");
  });
});
