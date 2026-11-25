import type { Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, FEEDBACK_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../src/core/conversation_store.js";
import { defineChat } from "../src/core/define_chat.js";
import type { FeedbackDetail } from "../src/core/events/feedback_detail.js";
import fixture from "./fixtures/model_fallback.json";

defineChat();

type RunName = keyof typeof fixture.runs;

const USER: Message = { id: "u1", role: "user", content: "hi" };

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function store(seed: readonly Message[]): ClientConversationStore & { saved(): Message[] } {
  let saved = JSON.parse(JSON.stringify(seed)) as Message[];
  return {
    saved: () => JSON.parse(JSON.stringify(saved)) as Message[],
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: (): Promise<readonly Message[] | null> =>
      Promise.resolve(saved.length === 0 ? null : saved),
    saveMessages: (_threadId: string, messages: readonly Message[]): void => {
      saved = [...messages];
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
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function mount(conversations: ClientConversationStore): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-message-actions", "copy,feedback");
  el.conversationStore = conversations;
  document.body.appendChild(el);
  return el;
}

async function live(run: RunName, conversations = store([])): Promise<AgUiChat> {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(fixture.runs[run].sse, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    ),
  );
  const el = mount(conversations);
  await settle();
  await el.sendMessage("hi");
  await settle();
  return el;
}

async function reloaded(messages: readonly Message[]): Promise<AgUiChat> {
  const el = mount(store(messages));
  await settle();
  return el;
}

function stored(run: RunName): Message[] {
  return [USER, ...(fixture.runs[run].stored as unknown as Message[])];
}

function modelLines(el: AgUiChat): (string | null)[] {
  return Array.from(
    shadow(el).querySelectorAll(".message--assistant .answered-by-model"),
    (line) => line.textContent,
  );
}

describe("an answer a fallback model gave", () => {
  it("names the model under the answer, live", async () => {
    const el = await live("fallback");

    expect(modelLines(el)).toEqual(["Answered by function:function::spare"]);
    expect(shadow(el).querySelector(".answered-by-model")?.getAttribute("part")).toBe(
      "answered-by-model",
    );
  });

  it("names it after a reload from the thread endpoint's stored copy", async () => {
    const el = await reloaded(stored("fallback"));

    expect(modelLines(el)).toEqual(["Answered by function:function::spare"]);
  });

  it("names it after a reload from what the element saved live", async () => {
    const conversations = store([]);
    await live("fallback", conversations);
    document.body.innerHTML = "";

    const el = await reloaded(conversations.saved());

    expect(modelLines(el)).toEqual(["Answered by function:function::spare"]);
  });

  it("leaves the line out of what Copy and a rating carry", async () => {
    const el = await live("fallback");
    const seen: FeedbackDetail[] = [];
    el.addEventListener(FEEDBACK_EVENT, (e) =>
      seen.push((e as CustomEvent<FeedbackDetail>).detail),
    );

    shadow(el).querySelector<HTMLButtonElement>(".message-action--up")?.click();

    expect(seen.map((d) => d.content)).toEqual(["from the spare"]);
  });

  it("takes its words from the host's strings", async () => {
    const conversations = store(stored("fallback"));
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("data-start-open", "");
    el.setAttribute("data-strings", JSON.stringify({ answeredByModel: "Via {model}" }));
    el.conversationStore = conversations;
    document.body.appendChild(el);
    await settle();

    expect(modelLines(el)).toEqual(["Via function:function::spare"]);
  });
});

describe("an answer the request's first model gave", () => {
  it("names no model, live or after a reload", async () => {
    expect(modelLines(await live("primary"))).toEqual([]);
    expect(modelLines(await reloaded(stored("primary")))).toEqual([]);
  });
});
