import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiAgents } from "../src/agents/ag_ui_agents.js";
import { defineAgents } from "../src/agents/define_agents.js";
import type { AgentEntry } from "../src/agents/types.js";
import {
  AGENTS_TAG,
  CUSTOM_AGENT_EVENT,
  ELEMENT_TAG,
  OPEN_EDITOR_EVENT,
  SKILLS_CHANGED_CUSTOM_NAME,
  SKILLS_TAG,
} from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import type { OpenEditorDetail } from "../src/core/events/open_editor_detail.js";
import type { AgUiSkills } from "../src/skills/ag_ui_skills.js";
import { defineSkills } from "../src/skills/define_skills.js";
import recorded from "./fixtures/skill_editor.json";

const EDITOR = "/a/skills/editor/";
const CATALOG = "/a/skills/";
const REPORT = recorded.answers.list.body.skills[0] as Record<string, unknown>;

interface Seen {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
}

let seen: Seen[];
let skills: Record<string, unknown>[];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function install(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      seen.push({ url, method, headers: new Headers(init.headers) });
      if (url === "/agents/") {
        const entry: AgentEntry = {
          id: "a",
          name: "a",
          description: "a",
          endpoint: "/a/",
          tools_url: null,
          threads_url: null,
          runs_url: null,
          skills_url: null,
          skill_editor_url: EDITOR,
          attachments_url: null,
          transcribe_url: null,
        };
        return json(200, { agents: [entry] });
      }
      if (url === CATALOG) {
        return json(200, []);
      }
      if (url === EDITOR) {
        return json(200, { skills });
      }
      if (url.startsWith(EDITOR) && method === "PATCH") {
        const body = JSON.parse(init.body as string) as { enabled: boolean };
        return json(200, { ...REPORT, enabled: body.enabled });
      }
      return json(404, {});
    }),
  );
}

async function flush(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 20; j += 1) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function editor(attrs: Record<string, string> = {}): AgUiSkills {
  const el = document.createElement(SKILLS_TAG) as AgUiSkills;
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  return el;
}

function chat(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.id = "chat";
  el.setAttribute("endpoint", "/a/");
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  return el;
}

function root(el: Element): ShadowRoot {
  return el.shadowRoot as ShadowRoot;
}

function q<T extends Element = HTMLElement>(el: Element, selector: string): T {
  const found = root(el).querySelector<T>(selector);
  if (found === null) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

function buttons(el: Element): string[] {
  return [...root(el).querySelectorAll(".panel-view-body button, .panel-view-footer button")].map(
    (button) => button.textContent ?? "",
  );
}

function byText(el: Element, text: string): HTMLButtonElement {
  const found = [...root(el).querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === text,
  );
  if (found === undefined) {
    throw new Error(`expected a button "${text}"`);
  }
  return found;
}

function editorGets(): number {
  return seen.filter((s) => s.url === EDITOR && s.method === "GET").length;
}

describe("<ag-ui-skills>", () => {
  beforeAll(() => {
    defineChat();
    defineAgents();
    defineSkills();
  });

  beforeEach(() => {
    document.body.replaceChildren();
    sessionStorage.clear();
    seen = [];
    skills = [];
    install();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("alone, draws the empty state with Write it yourself and no draft button", async () => {
    const el = editor({ "data-skill-editor-url": EDITOR, "data-csrf-token": "tok" });
    document.body.append(el);
    await flush();
    expect(q(el, ".panel-view-title").textContent).toBe("Skills");
    expect(q(el, ".header-btn--back").hidden).toBe(true);
    expect(buttons(el)).toEqual(["Write it yourself"]);
    expect(seen[0]?.headers.get("X-CSRFToken")).toBe("tok");
  });

  it("alone, lists the skills, opens one and steps back, and a write needs no chat", async () => {
    skills = [{ ...REPORT, enabled: false }];
    const el = editor({ "data-skill-editor-url": EDITOR });
    document.body.append(el);
    await flush();
    expect(q(el, ".skill-row-name").textContent).toBe("/weekly-report");
    expect(buttons(el)).not.toContain("Draft one with the agent");
    byText(el, "Turn on").click();
    await flush();
    expect(seen.at(-1)?.method).toBe("PATCH");
    expect(q(el, ".skill-row").className).toBe("skill-row");

    q<HTMLButtonElement>(el, ".skill-row-open").click();
    expect(q(el, ".header-btn--back").hidden).toBe(false);
    expect(q(el, ".header-btn--back").getAttribute("aria-label")).toBe("Back to the skills");
    q<HTMLButtonElement>(el, ".header-btn--back").click();
    expect(q(el, ".panel-view-title").textContent).toBe("Skills");
  });

  it("treats a back at the list as nothing to step back to", async () => {
    const el = editor({ "data-skill-editor-url": EDITOR });
    document.body.append(el);
    await flush();
    q<HTMLButtonElement>(el, ".header-btn--back").click();
    expect(q(el, ".panel-view-title").textContent).toBe("Skills");
    expect(q(el, ".panel-view").hidden).toBe(false);
  });

  it("bound to a chat, drafts there, refreshes its palette after a write, and reloads on a saved skill", async () => {
    skills = [{ ...REPORT, enabled: false }];
    const host = chat({ "data-skill-editor-url": EDITOR, "data-skills-url": CATALOG });
    const el = editor({ for: "chat" });
    document.body.append(host, el);
    await flush();
    const sent = vi.spyOn(host, "sendMessage").mockResolvedValue(true);
    byText(el, "Draft one with the agent").click();
    expect(sent).toHaveBeenCalledWith("/create-skill");

    const catalogs = seen.filter((s) => s.url === CATALOG).length;
    byText(el, "Turn on").click();
    await flush();
    expect(seen.filter((s) => s.url === CATALOG).length).toBe(catalogs + 1);

    const before = editorGets();
    host.dispatchEvent(
      new CustomEvent(CUSTOM_AGENT_EVENT, { detail: { name: "other", value: null } }),
    );
    host.dispatchEvent(
      new CustomEvent(CUSTOM_AGENT_EVENT, {
        detail: { name: SKILLS_CHANGED_CUSTOM_NAME, value: null },
      }),
    );
    await flush();
    expect(editorGets()).toBe(before + 1);
  });

  it("sends a list it loaded before its chat appeared through that chat, so the chat's headers go with it", async () => {
    const el = editor({ for: "chat", "data-skill-editor-url": EDITOR });
    document.body.append(el);
    await flush();
    const host = chat();
    host.headers = { Authorization: "Bearer x" };
    document.body.append(host);
    await flush();
    expect(el.chat).toBe(host);
    const lists = seen.filter((s) => s.url === EDITOR && s.method === "GET");
    expect(lists.at(-1)?.headers.get("Authorization")).toBe("Bearer x");
  });

  it("with the chat's editors external, answers the palette's Manage skills and the header button", async () => {
    const host = chat({
      "data-skill-editor-url": EDITOR,
      "data-skill-editor-button": "",
      "data-editors": "external",
    });
    const el = editor({ for: "chat" });
    const heard: OpenEditorDetail[] = [];
    document.addEventListener(OPEN_EDITOR_EVENT, (event) => {
      heard.push((event as CustomEvent<OpenEditorDetail>).detail);
    });
    document.body.append(host, el);
    await flush();
    q<HTMLButtonElement>(host, ".header-btn--skills").click();
    expect(heard).toEqual([{ editor: "skills", fromConversation: false }]);
    expect(q(host, ".panel-view").hidden).toBe(true);
    expect(root(el).activeElement).toBe(q(el, ".panel-view-title"));
  });

  it("under <ag-ui-agents>, takes the entry's editor URL and the provider's request", async () => {
    const home = document.createElement(AGENTS_TAG) as AgUiAgents;
    home.setAttribute("data-agents-url", "/agents/");
    home.getHeaders = () => ({ "X-Live": "1" });
    home.setAttribute("credentials", "include");
    home.append(chat());
    const el = editor();
    home.append(el);
    document.body.append(home);
    await flush();
    expect(el.url).toBe(EDITOR);
    const sent = seen.find((s) => s.url === EDITOR);
    expect(sent?.headers.get("X-Live")).toBe("1");
  });
});
