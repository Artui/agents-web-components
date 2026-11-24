/**
 * A sub-agent's own tool calls, which django-ag-ui 0.90.0 also sends as the protocol's
 * `TOOL_CALL_*` events tagged with `subagentRunId`, are the child's, never the parent's.
 *
 * `tests/fixtures/subagent_tagged_tool_calls.json` is a byte copy of django-ag-ui's
 * `tests/fixtures/subagent_progress_stream.json` as its 0.90.0 generator wrote it; it is
 * replayed frame by frame through the real `HttpAgent`, so the tag reaches the component
 * exactly as `@ag-ui/client` delivers it.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../src/core/conversation_store.js";
import { defineChat } from "../src/core/define_chat.js";
import fixture from "./fixtures/subagent_tagged_tool_calls.json";

defineChat();

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function sse(events: readonly unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const FOLLOW_UP = [
  { type: "RUN_STARTED", threadId: "t1", runId: "r2" },
  { type: "RUN_FINISHED", threadId: "t1", runId: "r2" },
];

function copy(messages: readonly unknown[]): readonly Message[] {
  return JSON.parse(JSON.stringify(messages)) as readonly Message[];
}

/** A store that serialises, so a remount reads what the run wrote. */
function memoryStore(): ClientConversationStore & { saved: () => readonly Message[] } {
  let saved: readonly Message[] = [];
  return {
    saved: () => saved,
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: (): Promise<readonly Message[] | null> =>
      Promise.resolve(saved.length === 0 ? null : copy(saved)),
    saveMessages: (_threadId: string, messages: readonly Message[]): void => {
      saved = copy(messages);
    },
    loadCheckpoint: (): NavigationCheckpoint | null => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: (): Promise<readonly ThreadMeta[]> => Promise.resolve([]),
    renameThread: () => {},
  };
}

function cardNames(el: AgUiChat): (string | null)[] {
  return [...shadow(el).querySelectorAll(".tool-call-name")].map((name) => name.textContent);
}

function mount(
  store?: ClientConversationStore,
  events: readonly unknown[] = fixture.events,
): { el: AgUiChat; fetch: ReturnType<typeof vi.fn> } {
  const fetch = vi.fn((): Promise<Response> => Promise.resolve(sse(FOLLOW_UP)));
  fetch.mockImplementationOnce(() => Promise.resolve(sse(events)));
  vi.stubGlobal("fetch", fetch);
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-tool-display", "full");
  if (store !== undefined) {
    el.conversationStore = store;
  }
  document.body.appendChild(el);
  return { el, fetch };
}

async function send(el: AgUiChat): Promise<void> {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = "find the settlement passages";
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
  await settle();
}

describe("a sub-agent's tagged tool calls", () => {
  it("never run a frontend tool of the same name, nor start a client round", async () => {
    const tagged = fixture.events.filter(
      (event) => event.type === "TOOL_CALL_END" && "subagentRunId" in event,
    );
    expect(tagged.map((event) => event.toolCallId)).toEqual(["sub-1", "sub-2"]);
    const { el, fetch } = mount();
    const handler = vi.fn(() => "ran in the browser");
    el.registerTool({
      name: "lookup_docs",
      description: "a frontend tool named like the child's",
      parameters: { type: "object" },
      handler,
    });
    await send(el);

    expect(handler).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("draw no tool card of the parent's, leaving the delegations' own", async () => {
    const { el } = mount();
    await send(el);

    const names = [...shadow(el).querySelectorAll(".tool-call-name")].map(
      (name) => name.textContent,
    );
    expect(names).toEqual(["Delegate task", "Delegate task"]);
    expect(shadow(el).querySelectorAll(".subagent")).toHaveLength(2);
    const statuses = [...shadow(el).querySelectorAll<HTMLElement>(".tool-call")].map((card) =>
      card.getAttribute("data-status"),
    );
    expect(statuses).not.toContain("interrupted");
  });

  it("stay off the parent's cards when the saved conversation is drawn again", async () => {
    const store = memoryStore();
    const { el } = mount(store);
    await send(el);
    el.remove();
    document.body.innerHTML = "";

    const again = mount(store);
    await settle();

    expect(store.saved().length).toBeGreaterThan(0);
    expect(cardNames(again.el)).toEqual(["Delegate task", "Delegate task"]);
  });

  it("owe no parent result for a child's call that never came back", async () => {
    const events = fixture.events.filter(
      (event) => !(event.type === "TOOL_CALL_RESULT" && event.toolCallId === "sub-2"),
    );
    const { el, fetch } = mount(undefined, events);
    await send(el);
    await send(el);

    expect(fetch).toHaveBeenCalledTimes(2);
    const init = fetch.mock.calls[1]?.[1] as RequestInit;
    const posted = JSON.parse(init.body as string) as { messages: Message[] };
    const answers = posted.messages.filter(
      (message) => message.role === "tool" && message.toolCallId === "sub-2",
    );
    expect(answers).toEqual([]);
    expect(posted.messages.some((message) => message.subagentRunId === "subagent-call-1")).toBe(
      true,
    );
  });
});
