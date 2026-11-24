import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiAgents } from "../src/agents/ag_ui_agents.js";
import { defineAgents } from "../src/agents/define_agents.js";
import { AGENTS_TAG, ELEMENT_TAG, ROUTINES_TAG, THREAD_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import type { AgUiRoutines } from "../src/routines/ag_ui_routines.js";
import { defineRoutines } from "../src/routines/define_routines.js";

const LIST = "/a/routines/";

let requested: string[];

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 20; j += 1) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function title(el: Element): string | null {
  return (el.shadowRoot as ShadowRoot).querySelector(".panel-view-title")?.textContent ?? null;
}

function chat(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.id = "chat";
  el.setAttribute("endpoint", "/agent/");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  return el;
}

describe("an editor element met before the element it binds to is defined", () => {
  beforeAll(() => {
    defineRoutines();
  });

  beforeEach(() => {
    document.body.replaceChildren();
    requested = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requested.push(url);
        if (url === "/agents/") {
          const entry = {
            id: "a",
            name: "a",
            description: "a",
            endpoint: "/a/",
            routines_url: LIST,
          };
          return json({ agents: [entry] });
        }
        return json({ routines: [], grantable: [] });
      }),
    );
  });

  it("binds nothing when for names a plain element, and leaves no rejection behind", async () => {
    const rejected: unknown[] = [];
    const onRejection = (reason: unknown): void => {
      rejected.push(reason);
    };
    process.on("unhandledRejection", onRejection);
    const plain = document.createElement("div");
    plain.id = "chat";
    const el = document.createElement(ROUTINES_TAG) as AgUiRoutines;
    el.setAttribute("for", "chat");
    document.body.append(plain, el);
    await flush();
    process.off("unhandledRejection", onRejection);
    expect(el.chat).toBeNull();
    expect(rejected).toEqual([]);
  });

  it("binds a chat named by for once it is defined, and not before, waiting for it once", async () => {
    const waited = vi.spyOn(customElements, "whenDefined");
    const host = chat({ "data-routines-url": LIST });
    const el = document.createElement(ROUTINES_TAG) as AgUiRoutines;
    el.setAttribute("for", "chat");
    const page = document.createElement("div");
    page.addEventListener(THREAD_EVENT, (event) => event.stopPropagation());
    page.append(host, el);
    document.body.append(page);
    el.setAttribute("agents", "elsewhere");
    await flush();
    expect(el.chat).toBeNull();
    expect(requested).toEqual([]);
    expect(waited.mock.calls.filter(([name]) => name === ELEMENT_TAG)).toHaveLength(1);
    defineChat();
    await flush();
    expect(el.chat).toBe(host);
    expect(requested).toEqual([LIST]);
    expect(title(el)).toBe("Routines");
  });

  it("binds a provider around it once it is defined, and reads no URL from it before", async () => {
    const home = document.createElement(AGENTS_TAG) as AgUiAgents;
    home.setAttribute("data-agents-url", "/agents/");
    home.setAttribute("agent", "a");
    const el = document.createElement(ROUTINES_TAG) as AgUiRoutines;
    home.append(el);
    document.body.append(home);
    await flush();
    expect(el.provider).toBeNull();
    expect(el.url).toBeNull();
    defineAgents();
    await flush();
    expect(el.provider).toBe(home);
    expect(requested).toEqual(["/agents/", LIST]);
    expect(title(el)).toBe("Routines");
  });
});
