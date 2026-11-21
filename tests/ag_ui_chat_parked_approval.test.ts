import type { Interrupt, Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import {
  type ClientConversationStore,
  SessionStorageStore,
} from "../src/core/conversation_store.js";
import { defineChat } from "../src/core/define_chat.js";
import recorded from "./fixtures/thread_status.json";

defineChat();

const THREADS = "/agent/threads/";

interface Sent {
  readonly url: string;
  readonly method: string;
  readonly body: Record<string, unknown> | null;
}

function listedAs(kind: "approval" | "question") {
  const body = structuredClone(recorded.listed.body);
  for (const row of body.threads) {
    for (const interrupt of row.interrupts ?? []) {
      interrupt.metadata.kind = kind;
    }
  }
  return body;
}

function serve(listed: unknown): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      sent.push({
        url,
        method,
        body:
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null,
      });
      if (url === THREADS) {
        return new Response(JSON.stringify(listed), {
          status: 200,
          headers: { "content-type": "application/json", ETag: recorded.listed.etag },
        });
      }
      if (url === `${THREADS}t-approve/`) {
        return new Response(JSON.stringify({ messages: recorded.approvalHistory }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "/agent/" && method === "POST") {
        return new Response(recorded.resumedRun.body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }
      return new Response(null, { status: 404 });
    }),
  );
  return sent;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function mount(): Promise<AgUiChat> {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-threads-url", THREADS);
  document.body.appendChild(el);
  await settle();
  await el.switchThread("t-approve");
  await settle();
  return el;
}

function hostStore(
  waiting: () => Promise<readonly Interrupt[]>,
  loaded: Promise<void> = Promise.resolve(),
): ClientConversationStore {
  const inner = new SessionStorageStore("parked");
  inner.saveMessages("t-approve", recorded.approvalHistory as Message[]);
  return {
    threadId: () => inner.threadId(),
    newThread: () => inner.newThread(),
    loadMessages: async (id) => {
      await loaded;
      return inner.loadMessages(id);
    },
    saveMessages: (id, messages) => inner.saveMessages(id, messages),
    loadCheckpoint: (id) => inner.loadCheckpoint(id),
    saveCheckpoint: (id, checkpoint) => inner.saveCheckpoint(id, checkpoint),
    clear: (id) => inner.clear(id),
    listThreads: () => Promise.resolve([]),
    setActiveThread: (id) => inner.setActiveThread(id),
    renameThread: (id, title) => inner.renameThread(id, title),
    waitingInterrupts: waiting,
  };
}

function hosted(store: ClientConversationStore): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.conversationStore = store;
  document.body.appendChild(el);
  return el;
}

const approvals = (listedAs("approval").threads.find((row) => row.thread_id === "t-approve")
  ?.interrupts ?? []) as Interrupt[];

function shadow(el: AgUiChat): ShadowRoot {
  return el.shadowRoot as ShadowRoot;
}

function runs(sent: readonly Sent[]): Sent[] {
  return sent.filter((request) => request.url === "/agent/" && request.method === "POST");
}

describe("<ag-ui-chat> restoring a thread parked on an approval", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks on the call's own card, and resumes the run with the answer", async () => {
    const sent = serve(listedAs("approval"));
    const el = await mount();
    const card = shadow(el).querySelector('[data-tool-name="delete_invoice"]');

    expect(card).not.toBeNull();
    expect(card?.querySelector(".approval-btn--approve")).toBeInstanceOf(HTMLButtonElement);
    expect(el.running).toBe(true);
    expect(shadow(el).textContent).not.toContain("didn’t finish");
    expect(runs(sent)).toEqual([]);

    card?.querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();
    await settle();

    expect(runs(sent).map((request) => request.body?.["resume"])).toEqual([recorded.resumeSent]);
    expect(shadow(el).textContent).toContain("Deleted.");
    expect(el.running).toBe(false);
  });

  it("restores a thread parked on a question as before, offering nothing", async () => {
    const sent = serve(listedAs("question"));
    const el = await mount();

    expect(shadow(el).querySelector(".approval-btn--approve")).toBeNull();
    expect(el.running).toBe(false);
    expect(runs(sent)).toEqual([]);
  });

  it("leaves the run parked when the person switches away instead of answering", async () => {
    const sent = serve(listedAs("approval"));
    const el = await mount();
    el.newChat();
    await settle();

    expect(runs(sent)).toEqual([]);
    const stored = sessionStorage.getItem(
      Object.keys(sessionStorage).find((key) => key.includes("t-approve")) ?? "",
    );
    expect(stored ?? "").not.toContain('"role":"tool"');
  });

  it("restores as before when the store fails to say what the run waits on", async () => {
    const sent = serve(listedAs("approval"));
    const el = hosted(hostStore(() => Promise.reject(new Error("down"))));
    await settle();
    await el.switchThread("t-approve");
    await settle();

    expect(shadow(el).querySelector(".approval-btn--approve")).toBeNull();
    expect(shadow(el).textContent).toContain("Not finished");
    expect(el.running).toBe(false);
    expect(runs(sent)).toEqual([]);
  });

  it("sends a host's turn made during the restore after the answered run", async () => {
    const sent = serve(listedAs("approval"));
    let release: () => void = () => undefined;
    const loaded = new Promise<void>((resolve) => (release = resolve));
    const el = hosted(hostStore(() => Promise.resolve(approvals), loaded));
    await settle();
    const switching = el.switchThread("t-approve");
    await settle();
    const turn = el.sendMessage("And the next one");
    release();
    await switching;
    await settle();

    expect(runs(sent)).toEqual([]);
    shadow(el)
      .querySelector<HTMLButtonElement>('[data-tool-name="delete_invoice"] .approval-btn--approve')
      ?.click();
    await turn;
    await settle();

    const bodies = runs(sent).map((request) => request.body);
    expect(bodies.map((body) => body?.["resume"] ?? null)).toEqual([recorded.resumeSent, null]);
    expect(JSON.stringify(bodies[1]?.["messages"])).toContain("And the next one");
  });

  it("offers nothing when New chat is pressed while the store says what the run waits on", async () => {
    const sent = serve(listedAs("approval"));
    let answer: (interrupts: readonly Interrupt[]) => void = () => undefined;
    const waiting = new Promise<readonly Interrupt[]>((resolve) => (answer = resolve));
    const el = hosted(hostStore(() => waiting));
    await settle();
    const switching = el.switchThread("t-approve");
    await settle();
    el.newChat();
    answer(approvals);
    await switching;
    await settle();

    expect(shadow(el).querySelector(".message--user")).toBeNull();
    expect(shadow(el).querySelector('[data-tool-name="delete_invoice"]')).toBeNull();
    expect(el.running).toBe(false);
    expect(runs(sent)).toEqual([]);
  });
});
