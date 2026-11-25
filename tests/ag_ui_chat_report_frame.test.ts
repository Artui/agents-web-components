import type { Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, OPEN_THREAD_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../src/core/conversation_store.js";
import { defineChat } from "../src/core/define_chat.js";
import type { OpenThreadDetail } from "../src/core/events/open_thread_detail.js";
import fixture from "./fixtures/report_frame.json";

defineChat();

const USER: Message = { id: "u1", role: "user", content: "hi" };

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function store(seed: readonly Message[]): ClientConversationStore {
  let saved = JSON.parse(JSON.stringify(seed)) as Message[];
  return {
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

function mount(seed: readonly Message[]): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  el.conversationStore = store(seed);
  document.body.appendChild(el);
  return el;
}

async function live(): Promise<AgUiChat> {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(fixture.delivered.sse, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    ),
  );
  const el = mount([]);
  await settle();
  await el.sendMessage("hi");
  await settle();
  return el;
}

async function reloaded(messages: readonly Message[]): Promise<AgUiChat> {
  const el = mount(messages);
  await settle();
  return el;
}

function userBubbles(el: AgUiChat): (string | null)[] {
  return Array.from(shadow(el).querySelectorAll(".message--user"), (b) => b.textContent);
}

function reports(el: AgUiChat): Record<string, string | null>[] {
  return Array.from(shadow(el).querySelectorAll(".child-report"), (card) => ({
    origin: card.getAttribute("data-origin"),
    title: card.querySelector(".child-report-title")?.textContent ?? null,
    body: card.querySelector(".child-report-body")?.textContent ?? null,
    link: card.querySelector(".child-report-link")?.textContent ?? null,
  }));
}

const DRAWN = [
  {
    origin: "task_output",
    title: "Report from helper",
    body: "all done",
    link: "Open the helper task",
  },
  {
    origin: "task_question",
    title: "Question from helper",
    body: "which one?",
    link: "Open the helper task",
  },
];

describe("a child's report and question taken in during a run", () => {
  it("draws each as a card from the child, and the user's own line as a bubble, live", async () => {
    const el = await live();

    expect(reports(el)).toEqual(DRAWN);
    expect(userBubbles(el)).toEqual(["hi", "the user's own words"]);
    expect(shadow(el).textContent).not.toContain("<task_output");
  });

  it("draws the same after a reload of the stored activity", async () => {
    const el = await reloaded([USER, ...(fixture.delivered.stored as unknown as Message[])]);

    expect(reports(el)).toEqual(DRAWN);
    expect(userBubbles(el)).toEqual(["hi", "the user's own words"]);
  });
});

describe("a woken thread's server-held history", () => {
  it("hides the wake line and draws the report and question as cards", async () => {
    const el = await reloaded(fixture.replayed as unknown as Message[]);

    expect(userBubbles(el)).toEqual([]);
    expect(reports(el)).toEqual(DRAWN);
    expect(shadow(el).textContent).not.toContain("messages are waiting");
    expect(shadow(el).textContent).not.toContain("<task_output");
  });
});

describe("the link on a report", () => {
  it("asks to open the child's thread, and opens it when nobody takes the event", async () => {
    const el = await reloaded(fixture.replayed as unknown as Message[]);
    const asked: OpenThreadDetail[] = [];
    el.addEventListener(OPEN_THREAD_EVENT, (e) =>
      asked.push((e as CustomEvent<OpenThreadDetail>).detail),
    );
    const opened = vi.spyOn(el.conversationStore, "setActiveThread");

    shadow(el).querySelector<HTMLButtonElement>(".child-report-link")?.click();
    await settle();

    expect(asked).toEqual([{ agentId: "helper", threadId: "child-1" }]);
    expect(opened).toHaveBeenCalledWith("child-1");
  });

  it("opens nothing in place when the host takes the event", async () => {
    const el = await reloaded(fixture.replayed as unknown as Message[]);
    el.addEventListener(OPEN_THREAD_EVENT, (e) => e.preventDefault());
    const opened = vi.spyOn(el.conversationStore, "setActiveThread");

    shadow(el).querySelector<HTMLButtonElement>(".child-report-link")?.click();
    await settle();

    expect(opened).not.toHaveBeenCalledWith("child-1");
  });

  it("asks for no thread on a click anywhere else, or on the transcript's root", async () => {
    const el = await reloaded(fixture.replayed as unknown as Message[]);
    const asked: unknown[] = [];
    el.addEventListener(OPEN_THREAD_EVENT, (e) => asked.push(e));

    shadow(el).querySelector<HTMLElement>(".child-report-body")?.click();
    shadow(el).dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    expect(asked).toEqual([]);
  });

  it("names no agent when the report names none", async () => {
    const replayed = JSON.parse(JSON.stringify(fixture.replayed)) as Message[];
    const report = replayed[2] as unknown as { metadata: { task: Record<string, unknown> } };
    delete report.metadata.task["agentName"];
    const el = await reloaded(replayed);
    const asked: OpenThreadDetail[] = [];
    el.addEventListener(OPEN_THREAD_EVENT, (e) => {
      e.preventDefault();
      asked.push((e as CustomEvent<OpenThreadDetail>).detail);
    });

    shadow(el).querySelector<HTMLButtonElement>(".child-report-link")?.click();

    expect(asked).toEqual([{ agentId: null, threadId: "child-1" }]);
  });
});
