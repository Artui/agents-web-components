import type { AgentCapabilities } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiAgents } from "../src/agents/ag_ui_agents.js";
import { defineAgents } from "../src/agents/define_agents.js";
import type { AgentEntry } from "../src/agents/types.js";
import {
  AGENT_CHANGE_EVENT,
  AGENTS_CHANGE_EVENT,
  AGENTS_TAG,
  ELEMENT_TAG,
} from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

defineChat();
defineAgents();

const DIRECTORY = "/home/agents/";

// Shaped as django-ag-ui's agent_capabilities() dumps it: camelCase, undeclared keys absent.
const GUARDED: AgentCapabilities = {
  identity: { name: "Board", description: "The board agent" },
  transport: { streaming: true, resumable: true },
  tools: { supported: true, clientProvided: true },
  multimodal: { input: { file: true } },
  execution: { maxExecutionTime: 120000 },
  humanInTheLoop: { supported: true, approvals: true, interrupts: true },
};

const PLAIN: AgentCapabilities = {
  transport: { streaming: true, resumable: false },
  tools: { supported: true, clientProvided: true },
  reasoning: { supported: false },
};

function entry(id: string, overrides: Partial<AgentEntry> = {}): AgentEntry {
  return {
    id,
    name: id,
    description: `The ${id} agent`,
    endpoint: `/${id}/`,
    tools_url: null,
    threads_url: null,
    runs_url: null,
    skills_url: null,
    skill_editor_url: null,
    attachments_url: null,
    transcribe_url: null,
    ...overrides,
  };
}

function listing(agents: readonly AgentEntry[], etag = '"d1"'): Response {
  return new Response(JSON.stringify({ agents }), {
    status: 200,
    headers: { "content-type": "application/json", ETag: etag },
  });
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i += 1) {
    await Promise.resolve();
  }
}

function chat(script: (emit: Emit) => void = () => undefined): AgUiChat {
  const element = document.createElement(ELEMENT_TAG) as AgUiChat;
  element.agentFactory = () => makeFakeAgent({ script }).agent;
  return element;
}

function provider(): AgUiAgents {
  const element = document.createElement(AGENTS_TAG) as AgUiAgents;
  element.setAttribute("data-agents-url", DIRECTORY);
  return element;
}

async function mount(
  agents: readonly AgentEntry[],
  inner: AgUiChat = chat(),
): Promise<{ home: AgUiAgents; inner: AgUiChat }> {
  fetchMock.mockResolvedValue(listing(agents));
  const home = provider();
  home.append(inner);
  document.body.append(home);
  await flush();
  return { home, inner };
}

/** A host's own toolbar, hiding what the mounted agent declares it lacks. */
function hostToolbar(
  home: AgUiAgents,
): Record<"approvals" | "attachments" | "reasoning", HTMLElement> {
  const controls = {
    approvals: document.createElement("button"),
    attachments: document.createElement("button"),
    reasoning: document.createElement("button"),
  };
  const apply = async (): Promise<void> => {
    const capabilities = await home.getCapabilities();
    controls.approvals.hidden =
      capabilities !== undefined && capabilities.humanInTheLoop === undefined;
    controls.attachments.hidden =
      capabilities !== undefined && capabilities.multimodal?.input?.file !== true;
    controls.reasoning.hidden = capabilities?.reasoning?.supported === false;
  };
  home.addEventListener(AGENT_CHANGE_EVENT, () => void apply());
  home.addEventListener(AGENTS_CHANGE_EVENT, () => void apply());
  return controls;
}

beforeEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("<ag-ui-agents> getCapabilities()", () => {
  it("answers nothing before the directory is listed", async () => {
    expect(await provider().getCapabilities()).toBeUndefined();
  });

  it("answers the mounted entry's capabilities, following a switch", async () => {
    const { home } = await mount([
      entry("board", { capabilities: GUARDED }),
      entry("support", { capabilities: PLAIN }),
    ]);
    expect(await home.getCapabilities()).toEqual(GUARDED);
    home.agent = "support";
    expect(await home.getCapabilities()).toEqual(PLAIN);
  });

  it("answers nothing for an entry from a server that predates capabilities", async () => {
    const { home } = await mount([entry("board"), entry("support", { capabilities: PLAIN })]);
    expect(await home.getCapabilities()).toBeUndefined();
  });

  it("follows a re-listing that changes only the capabilities, without a remount", async () => {
    const { home, inner } = await mount([entry("board", { capabilities: PLAIN })]);
    const remounts = vi.fn();
    home.addEventListener(AGENT_CHANGE_EVENT, remounts);
    const store = inner.conversationStore;
    fetchMock.mockResolvedValue(listing([entry("board", { capabilities: GUARDED })], '"d2"'));
    await home.refresh();
    expect(await home.getCapabilities()).toEqual(GUARDED);
    expect(remounts).not.toHaveBeenCalled();
    expect(inner.conversationStore).toBe(store);
  });
});

describe("a host reading getCapabilities()", () => {
  it("hides the controls the mounted agent declares it lacks", async () => {
    fetchMock.mockResolvedValue(
      listing([
        entry("board", { capabilities: GUARDED }),
        entry("support", { capabilities: PLAIN }),
      ]),
    );
    const home = provider();
    const controls = hostToolbar(home);
    home.append(chat());
    document.body.append(home);
    await flush();
    expect(controls.approvals.hidden).toBe(false);
    expect(controls.attachments.hidden).toBe(false);
    expect(controls.reasoning.hidden).toBe(false);

    home.agent = "support";
    await flush();
    expect(controls.approvals.hidden).toBe(true);
    expect(controls.attachments.hidden).toBe(true);
    expect(controls.reasoning.hidden).toBe(true);
  });

  it("keeps every control for an entry that declares nothing, since undeclared is not unsupported", async () => {
    fetchMock.mockResolvedValue(listing([entry("board")]));
    const home = provider();
    const controls = hostToolbar(home);
    for (const control of Object.values(controls)) {
      control.hidden = true;
    }
    home.append(chat());
    document.body.append(home);
    await flush();
    expect(controls.approvals.hidden).toBe(false);
    expect(controls.attachments.hidden).toBe(false);
    expect(controls.reasoning.hidden).toBe(false);
  });
});

describe("the stream stays authoritative", () => {
  it("draws reasoning on a chat whose entry declares reasoning unsupported", async () => {
    const inner = chat((emit) => {
      emit.runStart();
      emit.reasoningStart();
      emit.reasoning("Let me think");
      emit.reasoningEnd();
      emit.text("42");
      emit.textEnd("42");
      emit.runEnd();
    });
    const { home } = await mount([entry("board", { capabilities: PLAIN })], inner);
    expect((await home.getCapabilities())?.reasoning?.supported).toBe(false);
    const root = inner.shadowRoot as ShadowRoot;
    const input = root.querySelector<HTMLTextAreaElement>(".input") as HTMLTextAreaElement;
    input.value = "ponder this";
    root.querySelector<HTMLButtonElement>(".send")?.click();
    await flush();
    expect(root.querySelector(".answer .thoughts .thoughts-body")?.textContent).toBe(
      "Let me think",
    );
  });
});

describe("<ag-ui-agents> data-routines-url", () => {
  it("wires the entry's routines_url into the chat, and removes it for an entry without one", async () => {
    const { home, inner } = await mount([
      entry("board", { routines_url: "/board/routines/" }),
      entry("support", { routines_url: null }),
      entry("legacy"),
    ]);
    expect(inner.getAttribute("data-routines-url")).toBe("/board/routines/");
    home.agent = "support";
    expect(inner.hasAttribute("data-routines-url")).toBe(false);
    home.agent = "board";
    home.agent = "legacy";
    expect(inner.hasAttribute("data-routines-url")).toBe(false);
    expect(inner.getAttribute("endpoint")).toBe("/legacy/");
  });
});
