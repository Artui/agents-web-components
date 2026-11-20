/**
 * The mark on a tool call card that a reviewer model or a routine approved,
 * which raises no interrupt and so has no approval card to carry it.
 *
 * Every payload here is django-ag-ui's own output, recorded by
 * `scripts/record_answered_by_fixture.py`: the live frame is its encoder's SSE
 * line, sent byte for byte through the real `HttpAgent`, and the stored message
 * is what its adapter dumps for the thread. The mark rides in `metadata`, the
 * one field `@ag-ui/client` 1.0 does not strip, under its snake_case key.
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
import fixture from "./fixtures/answered_by.json";

defineChat();

type Prefix = "reviewer" | "routine" | "unknown";

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function copy(messages: readonly unknown[]): readonly Message[] {
  return JSON.parse(JSON.stringify(messages)) as readonly Message[];
}

/** A store that serialises, so a remount reads what the run wrote. */
function memoryStore(seed: readonly unknown[] = []): ClientConversationStore {
  let saved = copy(seed);
  return {
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

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function mount(store: ClientConversationStore): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-tool-display", "full");
  el.conversationStore = store;
  document.body.appendChild(el);
  return el;
}

function frame(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** A run whose one server tool call ends in `result`, an SSE frame as the server encoded it. */
function stubRun(result: string): void {
  const body = [
    frame({ type: "RUN_STARTED", threadId: "t1", runId: "r1" }),
    frame({ type: "TOOL_CALL_START", toolCallId: "tc1", toolCallName: "book_flight" }),
    frame({ type: "TOOL_CALL_ARGS", toolCallId: "tc1", delta: "{}" }),
    frame({ type: "TOOL_CALL_END", toolCallId: "tc1" }),
    result,
    frame({ type: "RUN_FINISHED", threadId: "t1", runId: "r1" }),
  ].join("");
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
      ),
    ),
  );
}

const UNMARKED = frame({
  type: "TOOL_CALL_RESULT",
  messageId: "m1",
  toolCallId: "tc1",
  content: "ok",
});

/** The stored thread the server would hand back, its tool message as the adapter dumped it. */
function storedThread(tool: unknown): readonly unknown[] {
  return [
    { id: "1", role: "user", content: "book me a flight" },
    {
      id: "2",
      role: "assistant",
      toolCalls: [
        { id: "tc1", type: "function", function: { name: "book_flight", arguments: "{}" } },
      ],
    },
    tool,
  ];
}

function card(el: AgUiChat): HTMLElement {
  const found = shadow(el).querySelector<HTMLElement>(".tool-call");
  if (found === null) {
    throw new Error("expected a tool call card");
  }
  return found;
}

function markText(el: AgUiChat): string | null | undefined {
  return card(el).querySelector(".tool-call-answered-by")?.textContent;
}

async function live(result: string, store = memoryStore()): Promise<AgUiChat> {
  stubRun(result);
  const el = mount(store);
  await el.sendMessage("book me a flight");
  await settle();
  return el;
}

describe("a tool call another answerer approved", () => {
  it.each<[Prefix, string]>([
    ["reviewer", "Approved by a reviewer model"],
    ["routine", "Approved by a routine"],
  ])("marks a live %s-approved result", async (prefix, words) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = await live(fixture.frames[prefix]);

    expect(card(el).getAttribute("data-status")).toBe("done");
    expect(card(el).getAttribute("data-answered-by")).toBe(prefix);
    expect(markText(el)).toBe(words);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("[ag-ui][enforce]"))).toEqual([]);
  });

  it.each<Prefix>(["reviewer", "routine"])(
    "keeps a live %s mark across a remount over the same store",
    async (prefix) => {
      const store = memoryStore();
      const first = await live(fixture.frames[prefix], store);
      const before = markText(first);
      document.body.innerHTML = "";

      const el = mount(store);
      await settle();

      expect(card(el).getAttribute("data-answered-by")).toBe(prefix);
      expect(markText(el)).toBe(before);
    },
  );

  it.each<[Prefix, string]>([
    ["reviewer", "Approved by a reviewer model"],
    ["routine", "Approved by a routine"],
  ])("marks a %s-approved result restored from the stored thread", async (prefix, words) => {
    const el = mount(memoryStore(storedThread(fixture.messages[prefix])));
    await settle();

    expect(card(el).getAttribute("data-answered-by")).toBe(prefix);
    expect(markText(el)).toBe(words);
  });

  it("draws a live result with an unknown prefix as one with no mark", async () => {
    const unknown = card(await live(fixture.frames.unknown)).outerHTML;
    document.body.innerHTML = "";
    const plain = card(await live(UNMARKED)).outerHTML;

    expect(unknown).toBe(plain);
    expect(plain).not.toContain("answered-by");
  });

  it("draws a restored result with an unknown prefix as one with no mark", async () => {
    const { metadata: _dropped, ...bare } = fixture.messages.unknown;
    const unknown = mount(memoryStore(storedThread(fixture.messages.unknown)));
    await settle();
    const unknownHtml = card(unknown).outerHTML;
    document.body.innerHTML = "";
    const plain = mount(memoryStore(storedThread(bare)));
    await settle();

    expect(unknownHtml).toBe(card(plain).outerHTML);
    expect(unknownHtml).not.toContain("answered-by");
  });

  it("never reads the mark from the top level of a stored message", async () => {
    const { metadata, ...bare } = fixture.messages.reviewer;
    const el = mount(memoryStore(storedThread({ ...bare, ...metadata })));
    await settle();

    expect(card(el).hasAttribute("data-answered-by")).toBe(false);
  });
});
