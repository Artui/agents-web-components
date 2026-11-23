import type { Message } from "@ag-ui/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgUiAgents } from "../../src/agents/ag_ui_agents.js";
import { defineAgents } from "../../src/agents/define_agents.js";
import type { AgentEntry } from "../../src/agents/types.js";
import { AGENTS_TAG, ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";
import recorded from "../fixtures/thread_status.json";

defineChat();
defineAgents();

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

function storageKeys(): string[] {
  return Array.from(
    { length: sessionStorage.length },
    (_, index) => sessionStorage.key(index) ?? "",
  );
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const original = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = original;
  vi.restoreAllMocks();
  document.body.replaceChildren();
  sessionStorage.clear();
});

describe("<ag-ui-agents> in the browser's own sessionStorage", () => {
  it("keeps each agent's conversation and active thread apart, and restores them on return", async () => {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(input), location.href).pathname === "/home/agents/"
        ? Promise.resolve(Response.json({ agents: [entry("board"), entry("support")] }))
        : original(input, init)) as typeof fetch;
    const home = document.createElement(AGENTS_TAG) as AgUiAgents;
    home.setAttribute("data-agents-url", "/home/agents/");
    const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
    home.append(chat);
    document.body.append(home);
    await expect.poll(() => home.agent).toBe("board");
    await settle();

    const boardThread = chat.threadId as string;
    chat.conversationStore.saveMessages(boardThread, [
      { id: "u1", role: "user", content: "board work" } as Message,
    ]);
    home.agent = "support";
    await settle();

    expect(chat.threadId).not.toBe(boardThread);
    expect(await chat.conversationStore.loadMessages(chat.threadId as string)).toBeNull();

    home.agent = "board";
    await settle();

    expect(chat.threadId).toBe(boardThread);
    expect(await chat.conversationStore.loadMessages(boardThread)).toHaveLength(1);
    expect(storageKeys().some((key) => key.includes("agent:board"))).toBe(true);
    expect(storageKeys().some((key) => key.includes("agent:support"))).toBe(true);
  });

  it("gives a second chat on the same entry a namespace of its own", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(input), location.href).pathname === "/home/agents/"
        ? Promise.resolve(Response.json({ agents: [entry("board")] }))
        : original(input, init)) as typeof fetch;
    const homes = [0, 1].map((index) => {
      const home = document.createElement(AGENTS_TAG) as AgUiAgents;
      home.setAttribute("data-agents-url", "/home/agents/");
      const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
      chat.id = `chat-${index}`;
      home.append(chat);
      return { home, chat };
    });
    for (const { home } of homes) {
      document.body.append(home);
      await expect.poll(() => home.agent).toBe("board");
    }
    const [first, second] = homes.map(({ chat }) => chat.threadId as string);

    expect(second).not.toBe(first);
    expect(storageKeys().some((key) => key.startsWith("agents-web-components@agent:board~"))).toBe(
      true,
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

const STATUS_THREADS = "/status/threads/";

function serveStatus(run: (signal: AbortSignal | null) => Response): void {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), location.href).pathname;
    if (path === "/home/agents/") {
      return Promise.resolve(
        Response.json({
          agents: [{ ...entry("status"), threads_url: STATUS_THREADS }, entry("echo")],
        }),
      );
    }
    if (path === STATUS_THREADS) {
      const listed = structuredClone(recorded.listed.body);
      for (const row of listed.threads) {
        for (const interrupt of row.interrupts ?? []) {
          interrupt.metadata.kind = "approval";
        }
      }
      return Promise.resolve(Response.json(listed));
    }
    if (path === `${STATUS_THREADS}t-approve/`) {
      return Promise.resolve(Response.json({ messages: recorded.approvalHistory }));
    }
    if (path === "/status/" && init?.method === "POST") {
      return Promise.resolve(run(init?.signal ?? null));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  }) as typeof fetch;
}

/** Every stored entry under the echo agent's namespace that names `threadId`. */
function echoEntriesNaming(threadId: string): string[] {
  return storageKeys().filter(
    (key) =>
      key.includes("agent:echo") &&
      (key.includes(threadId) || (sessionStorage.getItem(key) ?? "").includes(threadId)),
  );
}

async function statusHome(): Promise<{ home: AgUiAgents; chat: AgUiChat }> {
  const home = document.createElement(AGENTS_TAG) as AgUiAgents;
  home.setAttribute("data-agents-url", "/home/agents/");
  const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
  home.append(chat);
  document.body.append(home);
  await expect.poll(() => home.agent).toBe("status");
  await settle();
  return { home, chat };
}

describe("<ag-ui-agents> switching away from a run in flight", () => {
  it("writes nothing of a thread parked on an approval under the next agent", async () => {
    serveStatus(() => new Response(null, { status: 500 }));
    const { home, chat } = await statusHome();
    await chat.switchThread("t-approve");
    const shadow = chat.shadowRoot as ShadowRoot;
    await expect.poll(() => shadow.querySelector(".approval-btn--approve") !== null).toBe(true);
    expect(chat.hasAttribute("data-running")).toBe(true);

    home.agent = "echo";
    for (let i = 0; i < 10; i += 1) {
      await settle();
    }

    expect(home.agent).toBe("echo");
    expect(echoEntriesNaming("t-approve")).toEqual([]);
    expect((await chat.conversationStore.listThreads()).map((row) => row.threadId)).not.toContain(
      "t-approve",
    );
  });

  it("writes nothing of a run still streaming under the next agent", async () => {
    const encoder = new TextEncoder();
    serveStatus(
      (signal) =>
        new Response(
          new ReadableStream({
            start(controller) {
              signal?.addEventListener("abort", () =>
                controller.error(new DOMException("aborted", "AbortError")),
              );
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "RUN_STARTED", threadId: "x", runId: "r" })}\n\n`,
                ),
              );
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const { home, chat } = await statusHome();
    const thread = chat.threadId as string;
    void chat.sendMessage("a long one");
    await expect.poll(() => chat.hasAttribute("data-running")).toBe(true);
    await settle();

    home.agent = "echo";
    for (let i = 0; i < 10; i += 1) {
      await settle();
    }

    expect(home.agent).toBe("echo");
    expect(echoEntriesNaming(thread)).toEqual([]);
  });
});
