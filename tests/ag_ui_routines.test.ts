import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiAgents } from "../src/agents/ag_ui_agents.js";
import { defineAgents } from "../src/agents/define_agents.js";
import type { AgentEntry } from "../src/agents/types.js";
import {
  AGENT_CHANGE_EVENT,
  AGENTS_TAG,
  ELEMENT_TAG,
  OPEN_EDITOR_EVENT,
  ROUTINES_OPEN_THREAD_EVENT,
  ROUTINES_TAG,
  RUN_FINISHED_EVENT,
  THREAD_EVENT,
} from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import type { OpenEditorDetail } from "../src/core/events/open_editor_detail.js";
import type { AgUiRoutines } from "../src/routines/ag_ui_routines.js";
import { defineRoutines } from "../src/routines/define_routines.js";
import recorded from "./fixtures/routines.json";

const URL_A = "/a/routines/";
const URL_B = "/b/routines/";
const STANDUP = { ...recorded.answers.list.body.routines[0], lastThreadId: "t-standup" };

interface Seen {
  readonly url: string;
  readonly headers: Headers;
  readonly credentials: RequestCredentials | undefined;
  readonly body: unknown;
}

let seen: Seen[];
let releaseSlow: () => void;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function agentStream(): Response {
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

function entry(id: string, routines: string | null): AgentEntry {
  return {
    id,
    name: id,
    description: id,
    endpoint: `/${id}/`,
    tools_url: null,
    threads_url: null,
    runs_url: null,
    skills_url: null,
    skill_editor_url: null,
    routines_url: routines,
    attachments_url: null,
    transcribe_url: null,
  };
}

function install(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      seen.push({
        url,
        headers: new Headers(init.headers),
        credentials: init.credentials,
        body: typeof init.body === "string" ? JSON.parse(init.body) : null,
      });
      if (url === "/agents/") {
        return json(200, { agents: [entry("a", URL_A), entry("b", URL_B)] });
      }
      if (url.endsWith("/runs/")) {
        return json(200, { runs: [] });
      }
      if (url === URL_A || url === URL_B) {
        return json(200, { routines: [STANDUP], grantable: [] });
      }
      if (url === "/slow/") {
        return new Promise<Response>((resolve) => {
          releaseSlow = () => resolve(json(200, { routines: [], grantable: [] }));
        });
      }
      if (url === "/broken/") {
        return json(500, {});
      }
      return agentStream();
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

function routines(attrs: Record<string, string> = {}): AgUiRoutines {
  const el = document.createElement(ROUTINES_TAG) as AgUiRoutines;
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  return el;
}

function chat(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.id = "chat";
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  return el;
}

function q<T extends Element = HTMLElement>(el: Element, selector: string): T {
  const found = (el.shadowRoot as ShadowRoot).querySelector<T>(selector);
  if (found === null) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

function title(el: Element): string | null {
  return q(el, ".panel-view-title").textContent;
}

function listed(prefix: string): string[] {
  return seen
    .filter((s) => s.url.startsWith(prefix) && !s.url.endsWith("/runs/"))
    .map((s) => s.url);
}

describe("<ag-ui-routines>", () => {
  beforeAll(() => {
    defineChat();
    defineAgents();
    defineRoutines();
  });

  beforeEach(() => {
    document.body.replaceChildren();
    sessionStorage.clear();
    seen = [];
    install();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // biome-ignore lint/suspicious/noDocumentCookie: the test clears the cookie it set
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("alone, lists the routines from its own URL with no back arrow and no Make this a routine", async () => {
    const el = routines({ "data-routines-url": URL_A });
    document.body.append(el);
    await flush();
    expect(title(el)).toBe("Routines");
    expect(q(el, ".panel-view").hidden).toBe(false);
    expect(q(el, ".header-btn--back").hidden).toBe(true);
    expect((el.shadowRoot as ShadowRoot).querySelector("[part='make-routine']")).toBeNull();
    expect(el.chat).toBeNull();
    expect(el.provider).toBeNull();
    expect(listed(URL_A)).toEqual([URL_A]);
    expect(seen[0]?.credentials).toBe("same-origin");
    expect(seen[0]?.headers.has("X-CSRFToken")).toBe(false);
  });

  it("alone, steps from the form back to the list, and the back arrow shows only on the form", async () => {
    const el = routines({ "data-routines-url": URL_A });
    document.body.append(el);
    await flush();
    q<HTMLButtonElement>(el, ".header-btn--new-routine").click();
    expect(title(el)).toBe("New routine");
    const back = q<HTMLButtonElement>(el, ".header-btn--back");
    expect(back.hidden).toBe(false);
    expect(back.getAttribute("aria-label")).toBe("Back to the routines");
    back.click();
    expect(title(el)).toBe("Routines");
    expect(back.hidden).toBe(true);
  });

  it("moves focus only when it is already inside: onto the back arrow, then onto the heading at the root", async () => {
    const outside = document.createElement("button");
    const el = routines({ "data-routines-url": URL_A });
    document.body.append(outside, el);
    outside.focus();
    await flush();
    expect(document.activeElement).toBe(outside);
    const add = q<HTMLButtonElement>(el, ".header-btn--new-routine");
    add.focus();
    add.click();
    const root = el.shadowRoot as ShadowRoot;
    expect(root.activeElement).toBe(q(el, ".header-btn--back"));
    q<HTMLButtonElement>(el, ".header-btn--back").click();
    expect(root.activeElement).toBe(q(el, ".panel-view-title"));
    expect(q(el, ".panel-view-title").tabIndex).toBe(-1);
  });

  it("draws nothing and asks nothing without a URL, or with it empty, and loads once one is set", async () => {
    const el = routines({ "data-routines-url": "" });
    document.body.append(el);
    await flush();
    el.makeRoutine();
    expect(q(el, ".panel-view").hidden).toBe(true);
    expect(seen).toEqual([]);
    el.setAttribute("data-routines-url", URL_A);
    await flush();
    expect(title(el)).toBe("Routines");
    el.removeAttribute("data-routines-url");
    await flush();
    expect(q(el, ".panel-view").hidden).toBe(true);
  });

  it("alone, sends its own CSRF token and credentials, the token read from a cookie per request", async () => {
    const el = routines({
      "data-routines-url": URL_A,
      "data-csrf-token": "tok",
      "data-csrf-header": "X-Token",
      credentials: "include",
    });
    document.body.append(el);
    await flush();
    expect(seen[0]?.headers.get("X-Token")).toBe("tok");
    expect(seen[0]?.credentials).toBe("include");

    el.removeAttribute("data-csrf-token");
    el.removeAttribute("data-csrf-header");
    el.setAttribute("credentials", "nonsense");
    el.setAttribute("data-csrf-cookie", "csrftoken");
    // biome-ignore lint/suspicious/noDocumentCookie: the cookie a Django page sets
    document.cookie = "other=1";
    // biome-ignore lint/suspicious/noDocumentCookie: the cookie a Django page sets
    document.cookie = "csrftoken=c%201";
    seen = [];
    el.reload();
    await flush();
    expect(seen[0]?.headers.get("X-CSRFToken")).toBe("c 1");
    expect(seen[0]?.credentials).toBe("same-origin");

    el.setAttribute("data-csrf-cookie", "missing");
    seen = [];
    el.reload();
    await flush();
    expect(seen[0]?.headers.has("X-CSRFToken")).toBe(false);
  });

  it("alone, a last result fires the open-thread event and opens nothing", async () => {
    const el = routines({ "data-routines-url": URL_A });
    const asked: string[] = [];
    document.addEventListener(ROUTINES_OPEN_THREAD_EVENT, (event) =>
      asked.push((event as CustomEvent<{ threadId: string }>).detail.threadId),
    );
    document.body.append(el);
    await flush();
    q<HTMLButtonElement>(el, "[part='routine-last']").click();
    expect(asked).toEqual(["t-standup"]);
  });

  it("says the routines are unavailable when the list fails", async () => {
    const el = routines({ "data-routines-url": "/broken/" });
    document.body.append(el);
    await flush();
    expect(q(el, "[role='alert']").textContent).toBe("Routines could not be loaded.");
  });

  it("takes strings over the defaults and redraws, keeping the defaults it was not given", async () => {
    const el = routines({ "data-routines-url": URL_A });
    document.body.append(el);
    await flush();
    el.strings = { routines: "Abläufe" };
    await flush();
    expect(title(el)).toBe("Abläufe");
    expect(el.strings.newRoutine).toBe("New routine");
  });

  it("writes a routine into the controls slotted on it, reads them back, and takes its minute step", async () => {
    const el = routines({ "data-routines-url": URL_A, "data-routine-minute-step": "15" });
    const time = document.createElement("select");
    time.slot = "routine-time";
    for (const value of ["08:00", "09:30"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      time.append(option);
    }
    const zone = document.createElement("input");
    zone.slot = "routine-timezone";
    el.append(time, zone);
    document.body.append(el);
    await flush();
    q<HTMLButtonElement>(el, ".routine-row .skill-row-open").click();
    expect([time.value, zone.value]).toEqual(["08:00", "Europe/Paris"]);
    const minute = q<HTMLSelectElement>(el, "#routine-field-at-minute");
    expect([...minute.options].map((option) => option.value)).toEqual(["00", "15", "30", "45"]);
    time.value = "09:30";
    zone.value = "Asia/Tokyo";
    [...(el.shadowRoot as ShadowRoot).querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Save")
      ?.click();
    await flush();
    const put = seen.find((s) => s.url === `${URL_A}1/`)?.body as {
      schedule: { at: string };
      timezone: string;
    };
    expect([put.schedule.at, put.timezone]).toEqual(["09:30", "Asia/Tokyo"]);
  });

  it("treats a back at the list as nothing to step back to", async () => {
    const el = routines({ "data-routines-url": URL_A });
    document.body.append(el);
    await flush();
    q<HTMLButtonElement>(el, ".header-btn--back").click();
    expect(title(el)).toBe("Routines");
    expect(q(el, ".panel-view").hidden).toBe(false);
  });

  describe("bound by for", () => {
    it("reads the chat's URL, sends through the chat's request, and opens a last result there", async () => {
      const host = chat({ "data-routines-url": URL_A });
      host.getHeaders = () => ({ "X-CSRFToken": "chat-token" });
      const el = routines({ for: "chat" });
      document.body.append(host, el);
      await flush();
      expect(el.chat).toBe(host);
      expect(listed(URL_A)).toEqual([URL_A]);
      expect(seen.find((s) => s.url === URL_A)?.headers.get("X-CSRFToken")).toBe("chat-token");

      el.setAttribute("data-csrf-token", "own");
      el.reload();
      await flush();
      expect(
        seen
          .filter((s) => s.url === URL_A)
          .at(-1)
          ?.headers.get("X-CSRFToken"),
      ).toBe("own");

      const switched = vi.spyOn(host, "switchThread").mockRejectedValue(new Error("gone"));
      q<HTMLButtonElement>(el, "[part='routine-last']").click();
      expect(switched).toHaveBeenCalledWith("t-standup");

      const stop = (event: Event) => event.preventDefault();
      el.addEventListener(ROUTINES_OPEN_THREAD_EVENT, stop);
      q<HTMLButtonElement>(el, "[part='routine-last']").click();
      expect(switched).toHaveBeenCalledTimes(1);
    });

    it("prefers its own URL over the chat's, and the chat's empty URL is none", async () => {
      const host = chat({ "data-routines-url": "" });
      const el = routines({ for: "chat" });
      document.body.append(host, el);
      await flush();
      expect(el.url).toBeNull();
      el.setAttribute("data-routines-url", URL_B);
      await flush();
      expect(listed(URL_B)).toEqual([URL_B]);
    });

    it("offers Make this a routine once the chat has a prompt, and fills the form from it", async () => {
      const host = chat({ "data-routines-url": URL_A });
      const el = routines({ for: "chat" });
      document.body.append(host, el);
      await flush();
      el.makeRoutine();
      await flush();
      expect(title(el)).toBe("Routines");
      expect((el.shadowRoot as ShadowRoot).querySelector("[part='make-routine']")).toBeNull();

      await host.sendMessage("Summarise yesterday's tickets");
      await flush();
      q<HTMLButtonElement>(el, "[part='make-routine']").click();
      expect(title(el)).toBe("New routine");
      expect(q<HTMLTextAreaElement>(el, "#routine-field-prompt").value).toBe(
        "Summarise yesterday's tickets",
      );
    });

    it("binds a chat connected after it, when that chat reports its thread", async () => {
      const el = routines({ for: "chat" });
      document.body.append(el);
      await flush();
      expect(el.chat).toBeNull();
      document.body.append(chat({ "data-routines-url": URL_A }));
      await flush();
      expect(el.chat?.id).toBe("chat");
      expect(title(el)).toBe("Routines");
    });

    it("takes a chat set by property over for, and lets it go when set to null", async () => {
      const other = chat({ "data-routines-url": URL_B });
      other.id = "other";
      const el = routines({ for: "chat" });
      document.body.append(chat({ "data-routines-url": URL_A }), other, el);
      await flush();
      el.chat = other;
      await flush();
      expect(el.chat).toBe(other);
      expect(listed(URL_B)).toEqual([URL_B]);
      el.chat = null;
      await flush();
      expect((el.chat as HTMLElement | null)?.id).toBe("chat");
    });

    it("sends a list it loaded before its chat appeared through that chat, so the chat's headers go with it", async () => {
      const el = routines({ for: "chat", "data-routines-url": URL_A });
      document.body.append(el);
      await flush();
      const host = chat();
      host.headers = { Authorization: "Bearer x" };
      document.body.append(host);
      await flush();
      expect(el.chat).toBe(host);
      expect(
        seen
          .filter((s) => s.url === URL_A)
          .at(-1)
          ?.headers.get("Authorization"),
      ).toBe("Bearer x");
      expect(title(el)).toBe("Routines");
    });

    it("sends nothing while detached, and its first list once bound goes through the chat", async () => {
      const el = routines({ "data-routines-url": URL_A });
      el.strings = { routines: "Mine" };
      await flush();
      expect(seen).toEqual([]);
      const host = chat();
      host.headers = { Authorization: "Bearer x" };
      el.setAttribute("for", "chat");
      document.body.append(host, el);
      await flush();
      const lists = seen.filter((s) => s.url === URL_A);
      expect(lists.map((s) => s.headers.get("Authorization"))).toEqual(["Bearer x"]);
      expect(title(el)).toBe("Mine");
    });

    it("asks again for nothing when an attribute changes and leaves its URL and its route as they were", async () => {
      const el = routines({ "data-routines-url": URL_A });
      document.body.append(el);
      await flush();
      el.setAttribute("agents", "nowhere");
      el.setAttribute("data-routines-url", URL_A);
      await flush();
      expect(listed(URL_A)).toEqual([URL_A]);
    });

    it("binds a new chat with the id of the one it followed, once that one has left", async () => {
      const first = chat({ "data-routines-url": URL_A });
      const el = routines({ for: "chat" });
      document.body.append(first, el);
      await flush();
      first.remove();
      const second = chat({ "data-routines-url": URL_B });
      document.body.append(second);
      await flush();
      expect(el.chat).toBe(second);
      expect(listed(URL_B)).toEqual([URL_B]);
    });

    it("stops listening when it leaves the page", async () => {
      const host = chat({ "data-routines-url": URL_A, "data-editors": "external" });
      const el = routines({ for: "chat" });
      document.body.append(host, el);
      await flush();
      el.remove();
      expect(el.chat).toBeNull();
      const event = new CustomEvent<OpenEditorDetail>(OPEN_EDITOR_EVENT, {
        detail: { editor: "routines", fromConversation: false },
        cancelable: true,
      });
      host.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe("with the chat's editors external", () => {
    it("answers the chat's Routines button in place of the panel, taking focus", async () => {
      const host = chat({ "data-routines-url": URL_A, "data-editors": "external" });
      const el = routines({ for: "chat" });
      const heard: OpenEditorDetail[] = [];
      document.addEventListener(OPEN_EDITOR_EVENT, (event) => {
        heard.push((event as CustomEvent<OpenEditorDetail>).detail);
        expect(event.defaultPrevented).toBe(true);
      });
      document.body.append(host, el);
      await flush();
      q<HTMLButtonElement>(host, ".header-btn--routines").click();
      expect(heard).toEqual([{ editor: "routines", fromConversation: false }]);
      expect(q(host, ".panel-view").hidden).toBe(true);
      expect((el.shadowRoot as ShadowRoot).activeElement).toBe(q(el, ".panel-view-title"));
    });

    it("answers Make this a routine by filling its own form", async () => {
      const host = chat({ "data-routines-url": URL_A, "data-editors": "external" });
      const el = routines({ for: "chat" });
      document.body.append(host, el);
      await flush();
      await host.sendMessage("Plan the week");
      await flush();
      q<HTMLButtonElement>(host, ".header-menu .header-btn--make-routine").click();
      await flush();
      expect(title(el)).toBe("New routine");
      expect(q<HTMLTextAreaElement>(el, "#routine-field-prompt").value).toBe("Plan the week");
      expect(q(host, ".panel-view").hidden).toBe(true);
    });

    it("leaves an ask another listener already took, and fills no form from it", async () => {
      const host = chat({ "data-routines-url": URL_A, "data-editors": "external" });
      host.addEventListener(OPEN_EDITOR_EVENT, (event) => event.preventDefault(), {
        capture: true,
      });
      const el = routines({ for: "chat" });
      document.body.append(host, el);
      await flush();
      await host.sendMessage("Plan the week");
      await flush();
      host.dispatchEvent(
        new CustomEvent<OpenEditorDetail>(OPEN_EDITOR_EVENT, {
          detail: { editor: "routines", fromConversation: true },
          cancelable: true,
        }),
      );
      await flush();
      expect(title(el)).toBe("Routines");
      expect(listed(URL_A)).toEqual([URL_A]);
    });

    it("leaves an ask for another editor unanswered, and unprevented for that editor to answer", async () => {
      const host = chat({ "data-routines-url": URL_A, "data-editors": "external" });
      const el = routines({ for: "chat" });
      document.body.append(host, el);
      await flush();
      await host.sendMessage("Plan the week");
      await flush();
      const event = new CustomEvent<OpenEditorDetail>(OPEN_EDITOR_EVENT, {
        detail: { editor: "skills", fromConversation: true },
        cancelable: true,
      });
      host.dispatchEvent(event);
      await flush();
      expect(event.defaultPrevented).toBe(false);
      expect(title(el)).toBe("Routines");
      expect(listed(URL_A)).toEqual([URL_A]);
    });
  });

  describe("redrawing as the bound chat's conversation moves", () => {
    const moves = [THREAD_EVENT, RUN_FINISHED_EVENT];

    it.each(moves)("leaves an open routine form alone on %s", async (type) => {
      const host = chat({ "data-routines-url": URL_A });
      const el = routines({ for: "chat" });
      document.body.append(host, el);
      await flush();
      q<HTMLButtonElement>(el, ".header-btn--new-routine").click();
      expect(title(el)).toBe("New routine");
      host.dispatchEvent(new CustomEvent(type));
      expect(title(el)).toBe("New routine");
      expect(q(el, ".header-btn--back").hidden).toBe(false);
    });

    it.each(moves)("paints no empty list over one still loading on %s", async (type) => {
      const host = chat({ "data-routines-url": "/slow/" });
      const el = routines({ for: "chat" });
      document.body.append(host, el);
      await flush();
      host.dispatchEvent(new CustomEvent(type));
      expect(q(el, ".panel-view").hidden).toBe(true);
      expect((el.shadowRoot as ShadowRoot).querySelector("[part='routine-empty']")).toBeNull();
      releaseSlow();
      await flush();
      expect((el.shadowRoot as ShadowRoot).querySelector("[part='routine-empty']")).not.toBeNull();
    });

    it.each(moves)("paints no empty list over a failure on %s", async (type) => {
      const host = chat({ "data-routines-url": "/broken/" });
      const el = routines({ for: "chat" });
      document.body.append(host, el);
      await flush();
      host.dispatchEvent(new CustomEvent(type));
      expect(q(el, "[role='alert']").textContent).toBe("Routines could not be loaded.");
      expect((el.shadowRoot as ShadowRoot).querySelector("[part='routine-empty']")).toBeNull();
    });
  });

  describe("under <ag-ui-agents>", () => {
    function provider(): AgUiAgents {
      const home = document.createElement(AGENTS_TAG) as AgUiAgents;
      home.id = "home";
      home.setAttribute("data-agents-url", "/agents/");
      home.setAttribute("agent", "a");
      home.headers = { "X-Home": "1" };
      home.append(chat());
      return home;
    }

    it("follows the nearest provider's agent, its URL and request, and opens a thread through it", async () => {
      const home = provider();
      const el = routines();
      home.append(el);
      document.body.append(home);
      await flush();
      expect(el.provider).toBe(home);
      expect(el.chat).toBe(home.chat);
      expect(listed(URL_A)).toEqual([URL_A]);
      expect(seen.find((s) => s.url === URL_A)?.headers.get("X-Home")).toBe("1");

      const opened = vi.spyOn(home, "openThread").mockRejectedValue(new Error("gone"));
      q<HTMLButtonElement>(el, "[part='routine-last']").click();
      expect(opened).toHaveBeenCalledWith("a", "t-standup");

      home.agent = "b";
      await flush();
      expect(listed(URL_B)).toEqual([URL_B]);
    });

    it("sends its own CSRF token through the provider's request, over the provider's headers", async () => {
      const home = provider();
      home.headers = { "X-CSRFToken": "home" };
      const el = routines({ "data-csrf-token": "own" });
      home.append(el);
      document.body.append(home);
      await flush();
      const sent = seen.find((s) => s.url === URL_A);
      expect(sent?.headers.get("X-CSRFToken")).toBe("own");
    });

    it("finds a provider elsewhere on the page by agents", async () => {
      const home = provider();
      const el = routines({ agents: "home" });
      document.body.append(home, el);
      await flush();
      expect(el.provider).toBe(home);
      expect(title(el)).toBe("Routines");
    });

    it("takes a chat set by property over the provider's, with that chat's URL and request", async () => {
      const home = provider();
      const other = chat({ "data-routines-url": URL_B });
      other.headers = { "X-Other": "1" };
      const el = routines();
      home.append(el);
      document.body.append(home, other);
      await flush();
      expect(el.provider).toBe(home);
      el.chat = other;
      await flush();
      expect(el.chat).toBe(other);
      expect(el.provider).toBeNull();
      expect(el.url).toBe(URL_B);
      const sent = seen.filter((s) => s.url === URL_B).at(-1);
      expect(sent?.headers.get("X-Other")).toBe("1");
      expect(sent?.headers.has("X-Home")).toBe(false);
    });

    it("fires the open-thread event for a provider with no agent on screen, and opens nothing", async () => {
      const home = document.createElement(AGENTS_TAG) as AgUiAgents;
      const el = routines({ "data-routines-url": URL_A });
      home.append(el);
      document.body.append(home);
      await flush();
      expect(home.agent).toBeNull();
      const opened = vi.spyOn(home, "openThread").mockResolvedValue(undefined);
      const asked: string[] = [];
      el.addEventListener(ROUTINES_OPEN_THREAD_EVENT, (event) =>
        asked.push((event as CustomEvent<{ threadId: string }>).detail.threadId),
      );
      q<HTMLButtonElement>(el, "[part='routine-last']").click();
      expect(asked).toEqual(["t-standup"]);
      expect(opened).not.toHaveBeenCalled();
    });

    it("lets go of the provider and the page's thread events when it leaves, and asks for nothing more", async () => {
      const home = provider();
      const el = routines();
      home.append(el);
      document.body.append(home);
      await flush();
      const unlistenedHome = vi.spyOn(home, "removeEventListener");
      const unlistenedPage = vi.spyOn(document, "removeEventListener");
      el.remove();
      expect(unlistenedHome).toHaveBeenCalledWith(AGENT_CHANGE_EVENT, expect.any(Function));
      expect(unlistenedPage).toHaveBeenCalledWith(THREAD_EVENT, expect.any(Function));
      seen = [];
      home.agent = "b";
      home.chat?.dispatchEvent(new CustomEvent(THREAD_EVENT, { bubbles: true, composed: true }));
      await flush();
      expect(listed(URL_B)).toEqual([]);
    });

    it("opens nothing before the provider has listed its agents", async () => {
      const home = document.createElement(AGENTS_TAG) as AgUiAgents;
      const el = routines();
      home.append(el);
      document.body.append(home);
      await flush();
      expect(el.url).toBeNull();
      el.dispatchEvent(new Event("noop"));
      expect(q(el, ".panel-view").hidden).toBe(true);
    });
  });
});
