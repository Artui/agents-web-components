import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CUSTOM_AGENT_EVENT, ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import type { CustomAgentDetail } from "../src/core/events/custom_agent_detail.js";
import type { EditorSkill } from "../src/skills/editor_skill.js";
import recorded from "./fixtures/skill_editor.json";

const SKILLS_URL = "/agent/skills/";
const EDITOR_URL = "/agent/skills/editor/";

interface Seen {
  readonly url: string;
  readonly method: string;
  readonly csrf: string | null;
  readonly body: unknown;
}

/**
 * A django-ag-ui mount on `fetch`: the catalog, the editor routes (refusing a
 * write without a CSRF header, as the view does by default) and the agent.
 */
class FakeServer {
  skills: EditorSkill[] = [];
  readonly seen: Seen[] = [];
  refuse: { status: number; body: unknown } | null = null;
  runEvents: Record<string, unknown>[] = [];
  #next = 1;
  #holdCatalog: (() => void) | null = null;
  holdNextCatalog = false;

  install(): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init: RequestInit = {}) => this.#handle(input, init)),
    );
  }

  releaseCatalog(): void {
    this.#holdCatalog?.();
  }

  async #handle(url: string, init: RequestInit): Promise<Response> {
    const method = init.method ?? "GET";
    const csrf = new Headers(init.headers).get("X-CSRFToken");
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : null;
    this.seen.push({ url, method, csrf, body });
    if (url === SKILLS_URL) {
      const catalog = this.skills
        .filter((skill) => skill.enabled && skill.userInvocable)
        .map((skill) => ({ name: skill.name, title: skill.name, description: skill.description }));
      if (this.holdNextCatalog) {
        this.holdNextCatalog = false;
        await new Promise<void>((resolve) => {
          this.#holdCatalog = resolve;
        });
      }
      return json(200, catalog);
    }
    if (url.startsWith(EDITOR_URL)) {
      return this.#editor(url, method, csrf, body);
    }
    if (url === "/agent/") {
      const frames = this.runEvents.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
      return new Response(frames, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    return json(404, { error: "not found" });
  }

  #editor(url: string, method: string, csrf: string | null, body: unknown): Response {
    if (method === "GET") {
      return json(200, { skills: this.skills });
    }
    if (csrf === null) {
      return json(403, { detail: "CSRF Failed" });
    }
    if (this.refuse !== null) {
      return json(this.refuse.status, this.refuse.body);
    }
    const id = url.slice(EDITOR_URL.length).replace(/\/$/, "");
    const draft = body as Record<string, unknown>;
    if (method === "POST") {
      const skill = {
        ...(draft as Omit<EditorSkill, "id" | "enabled">),
        id: String(this.#next++),
        enabled: true,
      };
      this.skills.push(skill);
      return json(201, skill);
    }
    const index = this.skills.findIndex((skill) => skill.id === id);
    const current = this.skills[index] as EditorSkill;
    const next =
      method === "PUT"
        ? { ...current, ...draft }
        : { ...current, enabled: draft["enabled"] === true };
    this.skills[index] = next as EditorSkill;
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
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function q<T extends Element>(el: AgUiChat, selector: string): T {
  const found = shadow(el).querySelector<T>(selector);
  if (found === null) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

function buttonNamed(el: AgUiChat, text: string): HTMLButtonElement {
  const found = [...shadow(el).querySelectorAll<HTMLButtonElement>(".panel-view button")].find(
    (button) => button.textContent === text,
  );
  if (found === undefined) {
    throw new Error(`expected a button "${text}"`);
  }
  return found;
}

function paletteNames(el: AgUiChat): string[] {
  const input = q<HTMLTextAreaElement>(el, ".input");
  input.value = "/";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const names = [...shadow(el).querySelectorAll(".skill-item-token")].map(
    (n) => n.textContent ?? "",
  );
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return names;
}

function fill(el: AgUiChat, values: { name?: string; description?: string; body?: string }): void {
  for (const [key, value] of Object.entries(values)) {
    const control = q<HTMLInputElement | HTMLTextAreaElement>(el, `#skill-field-${key}`);
    control.value = value;
  }
}

let server: FakeServer;
let token: string;

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-skills-url", SKILLS_URL);
  el.setAttribute("data-skill-editor-url", EDITOR_URL);
  el.setAttribute("data-skill-editor-button", "");
  el.setAttribute("data-slash-commands", "true");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  el.getHeaders = () => ({ "X-CSRFToken": token });
  document.body.appendChild(el);
  return el;
}

const WEEKLY = recorded.answers.created.body as EditorSkill;

describe("the skill editor in <ag-ui-chat>", () => {
  beforeAll(() => {
    defineChat();
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    server = new FakeServer();
    server.install();
    token = "token-1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers no header button and no palette row without data-skill-editor-url", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("data-slash-commands", "true");
    el.setAttribute("data-skill-editor-url", "");
    el.setAttribute("data-skill-editor-button", "");
    document.body.appendChild(el);
    await flush();

    expect(shadow(el).querySelector(".header-btn--skills")).toBeNull();
    const input = q<HTMLTextAreaElement>(el, ".input");
    input.value = "/";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(q<HTMLElement>(el, ".skill-palette").hidden).toBe(true);
    el.openSkillEditor();
    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(true);
  });

  it("offers the palette row but no header button without data-skill-editor-button", async () => {
    const el = mount();
    el.removeAttribute("data-skill-editor-button");
    el.remove();
    document.body.appendChild(el);
    await flush();

    expect(shadow(el).querySelector(".header-btn--skills")).toBeNull();
    const input = q<HTMLTextAreaElement>(el, ".input");
    input.value = "/";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(q<HTMLElement>(el, ".skill-item--manage").textContent).toBe("Manage skills");
  });

  it("opens from the header button in place of the transcript, with the empty state", async () => {
    const el = mount();
    await flush();

    q<HTMLButtonElement>(el, ".header-btn--skills").click();
    await flush();

    expect(q<HTMLElement>(el, ".chat").hasAttribute("data-panel-view")).toBe(true);
    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(false);
    expect(q<HTMLElement>(el, ".panel-view-title").textContent).toBe("Skills");
    expect(q<HTMLElement>(el, ".skill-empty h3").textContent).toBe("No skills yet");
    expect(q<HTMLElement>(el, ".skill-empty p").textContent).toContain("/weekly-report");
  });

  it("opens from the Manage skills row at the palette's foot, even with no skill to match", async () => {
    const el = mount();
    await flush();
    const input = q<HTMLTextAreaElement>(el, ".input");
    input.value = "/";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const manage = q<HTMLButtonElement>(el, ".skill-item--manage");
    expect(manage.textContent).toBe("Manage skills");
    manage.click();
    await flush();

    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(false);
  });

  it("sends an unmatched slash message on Enter rather than opening the editor", async () => {
    server.skills = [{ ...WEEKLY, enabled: true, userInvocable: true }];
    const el = mount();
    await flush();
    const input = q<HTMLTextAreaElement>(el, ".input");
    input.value = "/weekly-report for last week";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();

    expect(server.seen.filter((s) => s.url === "/agent/")).toHaveLength(1);
    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(true);
  });

  it("closes for the checkpoints list and for a new chat", async () => {
    const el = mount();
    await flush();
    const chat = q<HTMLElement>(el, ".chat");
    el.openSkillEditor();
    el.openCheckpoints();
    expect(chat.hasAttribute("data-panel-view")).toBe(false);
    el.openSkillEditor();
    el.newChat();
    expect(chat.hasAttribute("data-panel-view")).toBe(false);
  });

  it("puts a skill created in the editor into the palette without a reload", async () => {
    const el = mount();
    await flush();
    expect(paletteNames(el)).toEqual([]);

    el.openSkillEditor();
    await flush();
    buttonNamed(el, "Write it yourself").click();
    fill(el, { name: WEEKLY.name, description: WEEKLY.description, body: WEEKLY.body });
    buttonNamed(el, "Create").click();
    await flush();

    expect(paletteNames(el)).toEqual(["/weekly-report"]);
    expect(q<HTMLElement>(el, ".panel-view-status").textContent).toBe("Saved /weekly-report");
    expect([...shadow(el).querySelectorAll(".skill-row-name")].map((n) => n.textContent)).toEqual([
      "/weekly-report",
    ]);
  });

  it("sends the live CSRF header with each write, read at that moment", async () => {
    server.skills = [{ ...WEEKLY }];
    const el = mount();
    await flush();
    el.openSkillEditor();
    await flush();

    q<HTMLButtonElement>(el, ".skill-row-open").click();
    buttonNamed(el, "Turn off").click();
    await flush();
    token = "token-2";
    buttonNamed(el, "Turn on").click();
    await flush();

    const writes = server.seen.filter((seen) => seen.method !== "GET");
    expect(writes.map((seen) => [seen.method, seen.url, seen.csrf, seen.body])).toEqual([
      ["PATCH", "/agent/skills/editor/1/", "token-1", { enabled: false }],
      ["PATCH", "/agent/skills/editor/1/", "token-2", { enabled: true }],
    ]);
    expect(q<HTMLElement>(el, ".panel-view-status").textContent).toBe("/weekly-report is on again");
  });

  it("saves an edit with a PUT and shows the edited row", async () => {
    server.skills = [{ ...WEEKLY }];
    const el = mount();
    await flush();
    el.openSkillEditor();
    await flush();

    q<HTMLButtonElement>(el, ".skill-row-open").click();
    expect(q<HTMLElement>(el, ".panel-view-title").textContent).toBe("Edit skill");
    expect(q<HTMLElement>(el, ".panel-view-sub").textContent).toBe("/weekly-report");
    fill(el, { description: "Per team." });
    buttonNamed(el, "Save").click();
    await flush();

    expect(server.seen.at(-2)).toMatchObject({ method: "PUT", url: "/agent/skills/editor/1/" });
    expect(q<HTMLElement>(el, ".skill-row-desc").textContent).toBe("Per team.");
  });

  it("shows a refused save's message above the form when the answer names no field", async () => {
    server.refuse = recorded.answers.invalidName;
    const el = mount();
    await flush();
    el.openSkillEditor();
    await flush();
    buttonNamed(el, "Write it yourself").click();
    fill(el, { name: "Late Delivery", description: "d", body: "b" });
    buttonNamed(el, "Create").click();
    await flush();

    const error = q<HTMLElement>(el, ".skill-form-error");
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe(recorded.answers.invalidName.body.error);
    expect(q<HTMLElement>(el, ".panel-view-title").textContent).toBe("New skill");
  });

  it("shows the recorded missing-description refusal above the form, as it names no field", async () => {
    server.refuse = recorded.answers.missingDescription;
    const el = mount();
    await flush();
    el.openSkillEditor();
    await flush();
    buttonNamed(el, "Write it yourself").click();
    buttonNamed(el, "Create").click();
    await flush();

    expect(q<HTMLElement>(el, ".skill-form-error").textContent).toBe(
      recorded.answers.missingDescription.body.error,
    );
    expect(shadow(el).querySelector(".skill-field--bad")).toBeNull();
  });

  it("shows a refusal under the field a later server names", async () => {
    server.refuse = {
      status: 400,
      body: { error: "A skill needs a description.", field: "description" },
    };
    const el = mount();
    await flush();
    el.openSkillEditor();
    await flush();
    buttonNamed(el, "Write it yourself").click();
    buttonNamed(el, "Create").click();
    await flush();

    const field = q<HTMLElement>(el, '.skill-field[data-field="description"]');
    expect(field.classList.contains("skill-field--bad")).toBe(true);
    expect(field.querySelector(".skill-field-error")?.textContent).toBe(
      "A skill needs a description.",
    );
    expect(q<HTMLElement>(el, ".skill-form-error").hidden).toBe(true);
  });

  it("shows a refused write without CSRF as the generic failure", async () => {
    server.skills = [{ ...WEEKLY, enabled: false }];
    const el = mount();
    el.getHeaders = () => ({});
    await flush();
    el.openSkillEditor();
    await flush();

    buttonNamed(el, "Turn on").click();
    await flush();

    expect(q<HTMLElement>(el, ".panel-view-status").textContent).toBe(
      "The skill could not be saved.",
    );
    expect(q<HTMLElement>(el, ".skill-row").classList.contains("skill-row--off")).toBe(true);
  });

  it("drafts with the agent: back to the conversation, sending /create-skill", async () => {
    const el = mount();
    await flush();
    el.openSkillEditor();
    await flush();

    buttonNamed(el, "Draft one with the agent").click();
    await flush();

    expect(q<HTMLElement>(el, ".chat").hasAttribute("data-panel-view")).toBe(false);
    const run = server.seen.find((seen) => seen.url === "/agent/");
    expect(JSON.stringify(run?.body)).toContain("/create-skill");
  });

  it("steps back from a skill to the list, and from the list to the conversation", async () => {
    server.skills = [{ ...WEEKLY }];
    const el = mount();
    await flush();
    el.openSkillEditor();
    await flush();
    q<HTMLButtonElement>(el, ".skill-row-open").click();

    q<HTMLButtonElement>(el, ".header-btn--back").click();
    expect(q<HTMLElement>(el, ".panel-view-title").textContent).toBe("Skills");
    q<HTMLElement>(el, ".panel-view").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(true);
    expect(shadow(el).activeElement).toBe(q(el, ".input"));
    el.closeSkillEditor();
    expect(q<HTMLElement>(el, ".chat").hasAttribute("data-panel-view")).toBe(false);
  });

  it("refetches the catalog and closes the editor on a principal change", async () => {
    server.skills = [{ ...WEEKLY }];
    const el = mount({ "user-key": "alice" });
    await flush();
    el.openSkillEditor();
    await flush();
    expect(paletteNames(el)).toEqual(["/weekly-report"]);
    const fetchesBefore = server.seen.filter((seen) => seen.url === SKILLS_URL).length;

    server.skills = [];
    el.userKey = "bob";
    expect(paletteNames(el)).toEqual([]);
    expect(q<HTMLElement>(el, ".panel-view").hidden).toBe(true);
    expect(shadow(el).querySelector(".skill-row")).toBeNull();
    await flush();

    expect(server.seen.filter((seen) => seen.url === SKILLS_URL).length).toBe(fetchesBefore + 1);
  });

  it("refetches the catalog when a key arrives for an anonymous mount", async () => {
    const el = mount();
    await flush();
    server.skills = [{ ...WEEKLY }];

    el.userKey = "alice";
    await flush();

    expect(paletteNames(el)).toEqual(["/weekly-report"]);
  });

  it("drops a catalog answer a principal change overtook", async () => {
    server.skills = [{ ...WEEKLY }];
    server.holdNextCatalog = true;
    const el = mount({ "user-key": "alice" });
    await flush();

    server.skills = [];
    el.userKey = "bob";
    await flush();
    server.releaseCatalog();
    await flush();

    expect(paletteNames(el)).toEqual([]);
  });

  it("refetches the catalog and the open list on a skills-changed event, still forwarding it", async () => {
    const el = mount();
    await flush();
    el.openSkillEditor();
    await flush();
    const seen: CustomAgentDetail[] = [];
    el.addEventListener(CUSTOM_AGENT_EVENT, (event) => {
      seen.push((event as CustomEvent<CustomAgentDetail>).detail);
    });
    server.skills = [{ ...WEEKLY }];
    server.runEvents = [
      { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
      recorded.skillsChanged,
      { type: "RUN_FINISHED", threadId: "t1", runId: "r1" },
    ];

    await el.sendMessage("save it");
    await flush();

    expect(seen).toEqual([{ name: "ag_ui.skills_changed", value: { name: "weekly-report" } }]);
    expect(paletteNames(el)).toEqual(["/weekly-report"]);
    expect([...shadow(el).querySelectorAll(".skill-row-name")].map((n) => n.textContent)).toEqual([
      "/weekly-report",
    ]);
  });

  it("shows the list as unavailable when it will not load", async () => {
    const el = mount();
    await flush();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(500, { error: "boom" })),
    );

    el.openSkillEditor();
    await flush();

    expect(q<HTMLElement>(el, ".skill-editor-unavailable").textContent).toBe(
      "Skills could not be loaded.",
    );
  });
});
