/**
 * `<ag-ui-threads>` bound through an `<ag-ui-agents>` provider: the nearest
 * one, or the one `agents` names, with `for` winning over both, and the list
 * following the provider's chat from agent to agent.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiAgents } from "../src/agents/ag_ui_agents.js";
import { defineAgents } from "../src/agents/define_agents.js";
import type { AgentEntry } from "../src/agents/types.js";
import { AGENTS_TAG, ELEMENT_TAG, THREADS_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import type { AgUiThreads } from "../src/threads/ag_ui_threads.js";
import { defineThreads } from "../src/threads/define_threads.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

defineChat();
defineThreads();
defineAgents();

const DIRECTORY = "/home/agents/";

function entry(id: string): AgentEntry {
  return {
    id,
    name: id,
    description: "",
    endpoint: `/${id}/`,
    tools_url: null,
    threads_url: null,
    runs_url: null,
    skills_url: null,
    skill_editor_url: null,
    attachments_url: null,
    transcribe_url: null,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i += 1) {
    await Promise.resolve();
  }
}

function chat(id = "chat"): AgUiChat {
  const element = document.createElement(ELEMENT_TAG) as AgUiChat;
  element.id = id;
  element.agentFactory = () => makeFakeAgent({ script: () => undefined }).agent;
  return element;
}

function provider(id = "home"): AgUiAgents {
  const element = document.createElement(AGENTS_TAG) as AgUiAgents;
  element.id = id;
  element.setAttribute("data-agents-url", DIRECTORY);
  return element;
}

function list(attributes: Record<string, string> = {}): AgUiThreads {
  const element = document.createElement(THREADS_TAG) as AgUiThreads;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

function ids(threads: AgUiThreads): string[] {
  return [...(threads.shadowRoot as ShadowRoot).querySelectorAll<HTMLElement>(".row")].map(
    (row) => row.dataset["threadId"] ?? "",
  );
}

function said(target: AgUiChat, text: string): void {
  const threadId = target.threadId as string;
  target.conversationStore.saveMessages(threadId, [
    { id: `u-${text}`, role: "user", content: text } as Message,
  ]);
}

beforeEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ agents: [entry("board"), entry("support")] }), {
          status: 200,
        }),
      ),
    ),
  );
});

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("<ag-ui-threads> under <ag-ui-agents>", () => {
  it("binds to the nearest provider's chat and follows it from agent to agent", async () => {
    const home = provider();
    const inner = chat();
    const threads = list();
    home.append(threads, inner);
    document.body.append(home);
    await flush();

    expect(threads.chat).toBe(inner);
    said(inner, "board work");
    await threads.refresh();
    const boardThread = inner.threadId as string;
    expect(ids(threads)).toEqual([boardThread]);

    home.agent = "support";
    await flush();

    expect(threads.chat).toBe(inner);
    expect(ids(threads)).not.toContain(boardThread);

    home.agent = "board";
    await flush();
    expect(ids(threads)).toEqual([boardThread]);
  });

  it("binds to the provider `agents` names, from anywhere in the root", async () => {
    const home = provider("elsewhere");
    const inner = chat();
    home.append(inner);
    const threads = list({ agents: "elsewhere" });
    document.body.append(threads, home);
    await flush();

    expect(threads.chat).toBe(inner);
  });

  it("lets `for` win over a provider", async () => {
    const home = provider();
    const inner = chat("inner");
    const named = chat("named");
    const threads = list({ for: "named" });
    home.append(threads, inner);
    document.body.append(home, named);
    await flush();

    expect(threads.chat).toBe(named);

    threads.removeAttribute("for");
    expect(threads.chat).toBe(inner);
  });

  it("lets a chat set as a property win over a provider", async () => {
    const home = provider();
    const inner = chat("inner");
    const own = chat("own");
    const threads = list();
    home.append(threads, inner);
    document.body.append(home, own);
    await flush();
    threads.chat = own;

    expect(threads.chat).toBe(own);
  });

  it("picks up a provider's chat that arrives after the list", async () => {
    const home = provider();
    const threads = list();
    home.append(threads);
    document.body.append(home);
    expect(threads.chat).toBeNull();

    const inner = chat();
    home.append(inner);
    await flush();

    expect(threads.chat).toBe(inner);
  });

  it("stops following the provider once it leaves it", async () => {
    const home = provider();
    const inner = chat();
    const threads = list();
    home.append(threads, inner);
    document.body.append(home);
    await flush();
    threads.remove();

    home.agent = "support";
    await flush();

    expect(threads.chat).toBeNull();
  });

  it("binds to nothing when `agents` names no element", async () => {
    const threads = list({ agents: "missing" });
    document.body.append(threads);
    await flush();

    expect(threads.chat).toBeNull();
  });
});
