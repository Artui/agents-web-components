/**
 * A child session's link in the card that started it.
 *
 * The receipt `start_session` returns is the part of a delegation that
 * persists, so the link is read from the tool result on both paths: the live
 * settle and the restore. A child session runs headless in its own thread and
 * sends no SUBAGENT_* events into the parent's stream, so nothing else could
 * draw it after a reload.
 */

import type { Message } from "@ag-ui/core";
import { beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG, OPEN_THREAD_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../src/core/conversation_store.js";
import { defineChat } from "../src/core/define_chat.js";
import type { OpenThreadDetail } from "../src/core/events/open_thread_detail.js";
import {
  RECEIPT_CONTENT,
  REFUSAL_CONTENT,
  START_SESSION,
} from "./helpers/child_session_fixture.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

defineChat();

const LINK = '[part~="child-session-link"]';

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

/** A store over named threads, listing `threads` and recording each activation. */
function memoryStore(
  conversations: Record<string, readonly Message[]>,
  threads: readonly ThreadMeta[] = [],
): ClientConversationStore & {
  activated: string[];
  push: (threads: readonly ThreadMeta[]) => void;
} {
  let active = "parent-thread";
  const activated: string[] = [];
  let watcher: ((threads: readonly ThreadMeta[]) => void) | null = null;
  return {
    activated,
    push: (next) => watcher?.(next),
    watchThreads: (listener) => {
      watcher = listener;
      return () => {
        watcher = null;
      };
    },
    threadId: () => active,
    setActiveThread: (threadId: string) => {
      active = threadId;
      activated.push(threadId);
    },
    loadMessages: (threadId: string): Promise<readonly Message[] | null> =>
      Promise.resolve(conversations[threadId] ?? null),
    saveMessages: () => {},
    loadCheckpoint: (): NavigationCheckpoint | null => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: (): Promise<readonly ThreadMeta[]> => Promise.resolve(threads),
    renameThread: () => {},
  };
}

/** A parent conversation whose one call started a child with `content` as its result. */
function delegated(content: string, name = START_SESSION): readonly Message[] {
  return [
    { id: "u1", role: "user", content: "research the invoices" },
    {
      id: "a1",
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: "tc1",
          type: "function",
          function: { name, arguments: '{"agent":"researcher","prompt":"invoices"}' },
        },
      ],
    },
    { id: "r1", role: "tool", toolCallId: "tc1", content },
    { id: "a2", role: "assistant", content: "Started a researcher on it." },
  ] as Message[];
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

function mountOver(
  store: ClientConversationStore,
  display: string | null = "full",
  attrs: Record<string, string> = {},
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  el.setAttribute("data-start-open", "");
  if (display !== null) {
    el.setAttribute("data-tool-display", display);
  }
  el.conversationStore = store;
  document.body.appendChild(el);
  return el;
}

/** The link in `el`'s transcript, failing the test when there is none. */
function linkIn(el: AgUiChat): HTMLButtonElement {
  const link = shadow(el).querySelector<HTMLButtonElement>(LINK);
  if (link === null) {
    throw new Error("expected a child-session link");
  }
  return link;
}

function breadcrumbOf(el: AgUiChat): HTMLElement {
  const crumb = shadow(el).querySelector<HTMLElement>('[part~="parent-breadcrumb"]');
  if (crumb === null) {
    throw new Error("expected a breadcrumb");
  }
  return crumb;
}

/** Record every open request `el` sends out, preventing it when `prevent` says so. */
function openRequests(el: AgUiChat, prevent = false): CustomEvent<OpenThreadDetail>[] {
  const seen: CustomEvent<OpenThreadDetail>[] = [];
  el.addEventListener(OPEN_THREAD_EVENT, (event) => {
    seen.push(event as CustomEvent<OpenThreadDetail>);
    if (prevent) {
      event.preventDefault();
    }
  });
  return seen;
}

const PARENT_ROW: ThreadMeta = {
  threadId: "parent-thread",
  title: "Research the invoices",
  updatedAt: Date.now(),
  preview: "",
};

const CHILD_ROW: ThreadMeta = {
  threadId: "child-thread-1",
  title: "Invoices research",
  updatedAt: Date.now(),
  preview: "",
  status: "idle",
  parent: { threadId: "parent-thread", scope: "assistant" },
};

const WAITING_CHILD: ThreadMeta = {
  ...CHILD_ROW,
  status: "waiting",
  interrupts: [
    {
      id: "int-1",
      reason: "tool_call",
      message: "delete_invoice",
      toolCallId: "child-call-1",
      metadata: { kind: "approval", destructive: true },
    },
  ],
};

const CHILD_CONVERSATION = [
  { id: "c1", role: "user", content: "invoices" },
  { id: "c2", role: "assistant", content: "Researching." },
] as Message[];

describe("a restored start_session result", () => {
  it("links the card to the child's thread after a reload", async () => {
    const el = mountOver(memoryStore({ "parent-thread": delegated(RECEIPT_CONTENT) }));
    await settle();
    expect(shadow(el).querySelector('.tool-call[data-tool-name="start_session"]')).not.toBeNull();
    const link = shadow(el).querySelector<HTMLElement>(`.tool-call ${LINK}`);
    expect(link?.getAttribute("data-thread-id")).toBe("child-thread-1");
    expect(link?.getAttribute("data-agent-id")).toBe("researcher");
  });
});

describe("the link after a reload", () => {
  it("draws in the default tool display too", async () => {
    const el = mountOver(memoryStore({ "parent-thread": delegated(RECEIPT_CONTENT) }), null);
    await settle();
    expect(linkIn(el).getAttribute("data-thread-id")).toBe("child-thread-1");
  });

  it("is worded for the child's agent until a list says more", async () => {
    const el = mountOver(memoryStore({ "parent-thread": delegated(RECEIPT_CONTENT) }));
    await settle();
    expect(linkIn(el).textContent).toBe("Open the researcher task");
    expect(linkIn(el).hasAttribute("data-status")).toBe(false);
  });

  it("asks before it opens, then opens the child in place", async () => {
    const store = memoryStore({
      "parent-thread": delegated(RECEIPT_CONTENT),
      "child-thread-1": CHILD_CONVERSATION,
    });
    const el = mountOver(store);
    const seen = openRequests(el);
    await settle();
    linkIn(el).click();
    await settle();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.detail).toEqual({ agentId: "researcher", threadId: "child-thread-1" });
    expect(seen[0]?.bubbles).toBe(true);
    expect(seen[0]?.composed).toBe(true);
    expect(seen[0]?.cancelable).toBe(true);
    expect(el.threadId).toBe("child-thread-1");
    expect(store.activated).toContain("child-thread-1");
  });

  it("leaves the parent on screen when a host takes the request", async () => {
    const store = memoryStore({
      "parent-thread": delegated(RECEIPT_CONTENT),
      "child-thread-1": CHILD_CONVERSATION,
    });
    const el = mountOver(store);
    const seen = openRequests(el, true);
    await settle();
    linkIn(el).click();
    await settle();
    expect(seen).toHaveLength(1);
    expect(el.threadId).toBe("parent-thread");
    expect(store.activated).not.toContain("child-thread-1");
  });

  it("stays on the parent when the store cannot load the child", async () => {
    const store = memoryStore({ "parent-thread": delegated(RECEIPT_CONTENT) });
    const load = store.loadMessages.bind(store);
    store.loadMessages = (threadId: string) =>
      threadId === "child-thread-1" ? Promise.reject(new Error("gone")) : load(threadId);
    const el = mountOver(store);
    await settle();
    linkIn(el).click();
    await settle();
    expect(el.threadId).toBe("parent-thread");
    expect(linkIn(el).getAttribute("data-thread-id")).toBe("child-thread-1");
  });

  it("draws no link for a refusal or for another tool's result", async () => {
    for (const conversation of [
      delegated(REFUSAL_CONTENT),
      delegated(RECEIPT_CONTENT, "list_tasks"),
      delegated("not json"),
    ]) {
      document.body.innerHTML = "";
      const el = mountOver(memoryStore({ "parent-thread": conversation }));
      await settle();
      expect(shadow(el).querySelector(".tool-call")).not.toBeNull();
      expect(shadow(el).querySelector(LINK)).toBeNull();
    }
  });
});

describe("the link on the live path", () => {
  function liveChat(
    store: ClientConversationStore,
    hold: Promise<void> = Promise.resolve(),
  ): AgUiChat {
    const el = mountOver(store);
    el.agentFactory = () =>
      makeFakeAgent({
        script: async (emit) => {
          emit.runStart();
          emit.toolCall("tc1", START_SESSION, { agent: "researcher", prompt: "invoices" });
          emit.toolResult("tc1", RECEIPT_CONTENT);
          await hold;
          emit.text("Started a researcher on it.");
          emit.runEnd();
        },
      }).agent;
    return el;
  }

  it("links the card when the receipt streams in", async () => {
    const el = liveChat(memoryStore({}));
    await settle();
    await el.sendMessage("research the invoices");
    await settle();
    const link = linkIn(el);
    expect(link.closest(".tool-call")?.getAttribute("data-tool-name")).toBe(START_SESSION);
    expect(link.getAttribute("data-thread-id")).toBe("child-thread-1");
  });

  it("draws no link for a refusal", async () => {
    const el = mountOver(memoryStore({}));
    el.agentFactory = () =>
      makeFakeAgent({
        script: (emit) => {
          emit.runStart();
          emit.toolCall("tc1", START_SESSION, { agent: "nobody", prompt: "x" });
          emit.toolResult("tc1", REFUSAL_CONTENT);
          emit.runEnd();
        },
      }).agent;
    await settle();
    await el.sendMessage("research the invoices");
    await settle();
    expect(shadow(el).querySelector(".tool-call")).not.toBeNull();
    expect(shadow(el).querySelector(LINK)).toBeNull();
  });

  it("opens the child mid-run as a drawer pick would, letting go of the run", async () => {
    let release = (): void => {};
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = memoryStore({ "child-thread-1": CHILD_CONVERSATION });
    const el = liveChat(store, hold);
    await settle();
    const sent = el.sendMessage("research the invoices");
    await settle();
    expect(el.running).toBe(true);
    linkIn(el).click();
    await settle();
    expect(el.threadId).toBe("child-thread-1");
    expect(el.running).toBe(false);
    expect(shadow(el).querySelector(LINK)).toBeNull();
    release();
    await sent;
    await settle();
    expect(el.threadId).toBe("child-thread-1");
    expect(shadow(el).textContent).not.toContain("Started a researcher on it.");
  });
});

describe("a child that needs the user", () => {
  it("reads needs-you in the parent and offers no control that answers it", async () => {
    const store = memoryStore({ "parent-thread": delegated(RECEIPT_CONTENT) });
    const el = mountOver(store, "full", { "data-thread-status": "poll" });
    await settle();
    store.push([PARENT_ROW, WAITING_CHILD]);
    const link = linkIn(el);
    expect(link.getAttribute("data-status")).toBe("waiting");
    expect(link.textContent).toBe("The researcher task needs you");
    expect(shadow(el).querySelector(".approval, .confirm, .question, .confirm-btn")).toBeNull();
    expect(shadow(el).textContent).not.toContain("delete_invoice");
    store.push([PARENT_ROW, CHILD_ROW]);
    expect(link.getAttribute("data-status")).toBe("idle");
    expect(link.textContent).toBe("Open the researcher task");
  });

  it("is reworded by a list that arrived before the link", async () => {
    const store = memoryStore({}, [PARENT_ROW, WAITING_CHILD]);
    const el = mountOver(store, "full", { "data-thread-status": "poll" });
    await settle();
    store.push([PARENT_ROW, WAITING_CHILD]);
    el.agentFactory = () =>
      makeFakeAgent({
        script: (emit) => {
          emit.runStart();
          emit.toolCall("tc1", START_SESSION, { agent: "researcher", prompt: "invoices" });
          emit.toolResult("tc1", RECEIPT_CONTENT);
          emit.runEnd();
        },
      }).agent;
    await el.sendMessage("research the invoices");
    await settle();
    expect(linkIn(el).textContent).toBe("The researcher task needs you");
  });
});

describe("the breadcrumb", () => {
  function family(threads: readonly ThreadMeta[] = [PARENT_ROW, CHILD_ROW]) {
    return memoryStore(
      { "parent-thread": delegated(RECEIPT_CONTENT), "child-thread-1": CHILD_CONVERSATION },
      threads,
    );
  }

  it("is hidden on a thread that has no parent", async () => {
    const el = mountOver(family());
    await settle();
    expect(breadcrumbOf(el).hidden).toBe(true);
  });

  it("names the parent on the child, and opens it", async () => {
    const store = family();
    const el = mountOver(store);
    const seen = openRequests(el);
    await settle();
    linkIn(el).click();
    await settle();
    const crumb = breadcrumbOf(el);
    expect(crumb.hidden).toBe(false);
    expect(crumb.textContent).toBe("From Research the invoices");
    crumb.querySelector("button")?.click();
    await settle();
    expect(seen.at(-1)?.detail).toEqual({ agentId: "assistant", threadId: "parent-thread" });
    expect(el.threadId).toBe("parent-thread");
    expect(breadcrumbOf(el).hidden).toBe(true);
    expect(linkIn(el).getAttribute("data-thread-id")).toBe("child-thread-1");
  });

  it("falls back to a plain name when the list does not hold the parent", async () => {
    const el = mountOver(family([CHILD_ROW]));
    await settle();
    linkIn(el).click();
    await settle();
    expect(breadcrumbOf(el).textContent).toBe("From the conversation that started this one");
  });

  it("goes with a new chat", async () => {
    const el = mountOver(family());
    await settle();
    linkIn(el).click();
    await settle();
    expect(breadcrumbOf(el).hidden).toBe(false);
    el.newChat();
    await settle();
    expect(breadcrumbOf(el).hidden).toBe(true);
  });

  it("is reworded when the strings change", async () => {
    const el = mountOver(family());
    await settle();
    linkIn(el).click();
    await settle();
    el.remove();
    el.setAttribute("data-strings", JSON.stringify({ parentThread: "Back to {title}" }));
    document.body.appendChild(el);
    await settle();
    expect(breadcrumbOf(el).textContent).toBe("Back to Research the invoices");
  });
});
