/**
 * `<ag-ui-agents>` reading the directory and mounting a real `<ag-ui-chat>` on
 * an entry: the URLs it sets, the store it scopes to the entry, and that a
 * switch is a remount the chat takes without its connect-time warning.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiAgents } from "../src/agents/ag_ui_agents.js";
import { AgentStore } from "../src/agents/agent_store.js";
import { defineAgents } from "../src/agents/define_agents.js";
import type { AgentChangeDetail, AgentEntry, AgentsChangeDetail } from "../src/agents/types.js";
import {
  AGENT_CHANGE_EVENT,
  AGENTS_CHANGE_EVENT,
  AGENTS_TAG,
  ELEMENT_TAG,
} from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type { ClientConversationStore } from "../src/core/conversation_store.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import { defineChat } from "../src/core/define_chat.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

defineChat();
defineAgents();

const DIRECTORY = "/home/agents/";

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
    routines_url: null,
    attachments_url: null,
    transcribe_url: null,
    ...overrides,
  };
}

const BOARD = entry("board", { transcribe_url: "/board/transcribe/" });
const SUPPORT = entry("support", { runs_url: "/support/runs/" });

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

function chat(): AgUiChat {
  const element = document.createElement(ELEMENT_TAG) as AgUiChat;
  element.id = "chat";
  element.agentFactory = () => makeFakeAgent({ script: () => undefined }).agent;
  return element;
}

function provider(attributes: Record<string, string> = {}): AgUiAgents {
  const element = document.createElement(AGENTS_TAG) as AgUiAgents;
  element.setAttribute("data-agents-url", DIRECTORY);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

beforeEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(listing([BOARD, SUPPORT]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("<ag-ui-agents> directory", () => {
  it("lists the directory and mounts its chat on the first entry, without a warning", async () => {
    const warn = vi.spyOn(console, "warn");
    const home = provider();
    const before = document.createElement("p");
    const inner = chat();
    inner.setAttribute("data-runs-url", "/stale/runs/");
    const after = document.createElement("p");
    home.append(before, inner, after);
    const lists: AgentsChangeDetail[] = [];
    const switches: AgentChangeDetail[] = [];
    home.addEventListener(AGENTS_CHANGE_EVENT, (event) =>
      lists.push((event as CustomEvent<AgentsChangeDetail>).detail),
    );
    home.addEventListener(AGENT_CHANGE_EVENT, (event) =>
      switches.push((event as CustomEvent<AgentChangeDetail>).detail),
    );
    document.body.append(home);
    await flush();

    expect(home.agents.map((agent) => agent.id)).toEqual(["board", "support"]);
    expect(lists).toEqual([{ agents: [BOARD, SUPPORT] }]);
    expect(switches).toEqual([{ agent: BOARD }]);
    expect(home.agent).toBe("board");
    expect(inner.getAttribute("endpoint")).toBe("/board/");
    expect(inner.getAttribute("data-transcribe-url")).toBe("/board/transcribe/");
    expect(inner.hasAttribute("data-runs-url")).toBe(false);
    expect(inner.conversationStore).toBeInstanceOf(AgentStore);
    expect((inner.conversationStore as AgentStore).agentId).toBe("board");
    expect([...home.children]).toEqual([before, inner, after]);
    expect(inner.isConnected).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("mounts the entry `agent` names, and moves the chat when it changes", async () => {
    const warn = vi.spyOn(console, "warn");
    const home = provider({ agent: "support" });
    const inner = chat();
    home.append(inner);
    document.body.append(home);
    await flush();

    expect(inner.getAttribute("endpoint")).toBe("/support/");
    expect(inner.getAttribute("data-runs-url")).toBe("/support/runs/");
    const supportThread = inner.threadId;
    expect(supportThread).not.toBeNull();

    home.agent = "board";
    await flush();

    expect(home.agent).toBe("board");
    expect(inner.getAttribute("endpoint")).toBe("/board/");
    expect(inner.hasAttribute("data-runs-url")).toBe(false);
    expect((inner.conversationStore as AgentStore).agentId).toBe("board");
    expect(inner.threadId).not.toBe(supportThread);

    home.agent = "support";
    await flush();

    // Each agent keeps its own thread pointer under its own namespace.
    expect(inner.threadId).toBe(supportThread);
    expect(warn).not.toHaveBeenCalled();
  });

  it("remounts nothing when a re-listing keeps the entry, and remounts when its URLs move", async () => {
    const home = provider();
    const inner = chat();
    home.append(inner);
    const switches: string[] = [];
    home.addEventListener(AGENT_CHANGE_EVENT, (event) =>
      switches.push((event as CustomEvent<AgentChangeDetail>).detail.agent.endpoint),
    );
    document.body.append(home);
    await flush();
    const removed = vi.spyOn(inner, "remove");

    fetchMock.mockResolvedValueOnce(listing([{ ...BOARD }, SUPPORT], '"d2"'));
    await home.refresh();
    home.agent = "board";

    expect(removed).not.toHaveBeenCalled();
    expect(switches).toEqual(["/board/"]);

    fetchMock.mockResolvedValueOnce(listing([{ ...BOARD, tools_url: "/board/tools/" }], '"d3"'));
    await home.refresh();

    expect(removed).toHaveBeenCalledTimes(1);
    expect(inner.getAttribute("data-tools-url")).toBe("/board/tools/");
    expect(switches).toEqual(["/board/", "/board/"]);
  });

  it("warns when `agent` names no entry, and leaves the chat where it is", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const home = provider({ agent: "nobody" });
    const inner = chat();
    inner.setAttribute("endpoint", "/own/");
    home.append(inner);
    document.body.append(home);
    await flush();

    expect(warn).toHaveBeenCalledWith('<ag-ui-agents>: agent="nobody" is not in the directory.');
    expect(home.agent).toBeNull();
    expect(inner.getAttribute("endpoint")).toBe("/own/");
  });

  it("keeps a store of the host's own kind", async () => {
    const own: ClientConversationStore = new SessionStorageStore("host");
    const custom: ClientConversationStore = {
      threadId: () => own.threadId(),
      loadMessages: (id) => own.loadMessages(id),
      saveMessages: (id, messages) => own.saveMessages(id, messages),
      loadCheckpoint: (id) => own.loadCheckpoint(id),
      saveCheckpoint: (id, checkpoint) => own.saveCheckpoint(id, checkpoint),
      clear: (id) => own.clear(id),
      listThreads: () => own.listThreads(),
      setActiveThread: (id) => own.setActiveThread(id),
      renameThread: (id, title) => own.renameThread(id, title),
    };
    const home = provider();
    const inner = chat();
    inner.conversationStore = custom;
    home.append(inner);
    document.body.append(home);
    await flush();

    expect(inner.getAttribute("endpoint")).toBe("/board/");
    expect(inner.conversationStore).toBe(custom);
  });

  it("keeps a store of the host's own kind across switches that wrap it in a remote", async () => {
    const own = new SessionStorageStore("host");
    const custom: ClientConversationStore = {
      threadId: () => own.threadId(),
      loadMessages: (id) => own.loadMessages(id),
      saveMessages: (id, messages) => own.saveMessages(id, messages),
      loadCheckpoint: (id) => own.loadCheckpoint(id),
      saveCheckpoint: (id, checkpoint) => own.saveCheckpoint(id, checkpoint),
      clear: (id) => own.clear(id),
      listThreads: () => own.listThreads(),
      setActiveThread: (id) => own.setActiveThread(id),
      renameThread: (id, title) => own.renameThread(id, title),
    };
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        url === DIRECTORY
          ? listing([
              entry("a", { threads_url: "/a/threads/" }),
              entry("b", { threads_url: "/b/threads/" }),
              entry("c"),
            ])
          : new Response(JSON.stringify({ threads: [] }), { status: 200 }),
      ),
    );
    const home = provider();
    const inner = chat();
    inner.conversationStore = custom;
    home.append(inner);
    document.body.append(home);
    await flush();
    home.agent = "b";
    await flush();
    home.agent = "a";
    await flush();
    home.agent = "c";
    await flush();

    expect(inner.conversationStore).toBe(custom);
  });

  it("replaces the remote the chat wrapped its own store in", async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        url === DIRECTORY
          ? listing([BOARD, entry("threads", { threads_url: "/threads/threads/" })])
          : new Response(JSON.stringify({ threads: [] }), { status: 200 }),
      ),
    );
    const home = provider({ agent: "threads" });
    const inner = chat();
    home.append(inner);
    document.body.append(home);
    await flush();
    home.agent = "board";
    await flush();

    expect(inner.conversationStore).toBeInstanceOf(AgentStore);
    expect((inner.conversationStore as AgentStore).agentId).toBe("board");
  });

  it("mounts a chat set as a property, and tells without any chat", async () => {
    const home = provider();
    const switches: string[] = [];
    home.addEventListener(AGENT_CHANGE_EVENT, (event) =>
      switches.push((event as CustomEvent<AgentChangeDetail>).detail.agent.id),
    );
    document.body.append(home);
    await flush();

    expect(home.chat).toBeNull();
    expect(home.agent).toBe("board");
    expect(switches).toEqual(["board"]);

    const outside = chat();
    document.body.append(outside);
    home.chat = outside;

    expect(home.chat).toBe(outside);
    expect(outside.getAttribute("endpoint")).toBe("/board/");
    expect(switches).toEqual(["board", "board"]);

    // A chat that is not in the document is configured all the same.
    const detached = chat();
    home.chat = detached;
    expect(detached.getAttribute("endpoint")).toBe("/board/");
    expect(detached.isConnected).toBe(false);
  });

  it("opens a thread on another agent", async () => {
    const home = provider();
    const inner = chat();
    home.append(inner);
    document.body.append(home);
    await flush();
    const switched = vi.spyOn(inner, "switchThread").mockResolvedValue(undefined);

    await home.openThread("support", "t9");

    expect(home.agent).toBe("support");
    expect(switched).toHaveBeenCalledWith("t9");
  });

  it("opens no thread on an agent the directory does not hold, or before it is listed", async () => {
    const home = provider();
    const inner = chat();
    home.append(inner);
    const switched = vi.spyOn(inner, "switchThread").mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    document.body.append(home);

    await home.openThread("support", "early");
    await flush();
    await home.openThread("nobody", "t9");

    expect(home.agent).toBe("support");
    expect(switched).not.toHaveBeenCalled();
  });

  it("opens the thread on the real chat, over the active thread the agent restores", async () => {
    const home = provider({ agent: "support" });
    const inner = chat();
    home.append(inner);
    document.body.append(home);
    await flush();
    const theirs = inner.threadId as string;
    inner.conversationStore.saveMessages(theirs, [
      { id: "u1", role: "user", content: "support work" } as Message,
    ]);
    home.agent = "board";
    await flush();
    expect(inner.threadId).not.toBe(theirs);

    await home.openThread("support", theirs);
    await flush();

    expect(home.agent).toBe("support");
    expect(inner.threadId).toBe(theirs);
  });

  it("opens nothing without a chat", async () => {
    const home = provider();
    document.body.append(home);
    await flush();

    await expect(home.openThread("support", "t9")).resolves.toBeUndefined();
    expect(home.agent).toBe("support");
  });
});

describe("<ag-ui-agents> directory requests", () => {
  it("sends the headers, the cookie policy and the ETag, and keeps the list on a 304", async () => {
    const home = provider({ credentials: "include" });
    home.headers = { "X-Static": "s", "X-Both": "static" };
    home.getHeaders = () => ({ "X-Both": "live" });
    const lists: unknown[] = [];
    home.addEventListener(AGENTS_CHANGE_EVENT, (event) => lists.push(event));
    document.body.append(home);
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(DIRECTORY, {
      headers: { "X-Static": "s", "X-Both": "live" },
      credentials: "include",
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await home.refresh();

    expect(fetchMock).toHaveBeenLastCalledWith(DIRECTORY, {
      headers: { "X-Static": "s", "X-Both": "live", "If-None-Match": '"d1"' },
      credentials: "include",
    });
    expect(home.agents).toHaveLength(2);
    expect(lists).toHaveLength(1);
  });

  it("ignores a cookie policy fetch does not know", () => {
    const home = provider({ credentials: "always" });
    expect(home.credentials).toBeNull();
    home.removeAttribute("credentials");
    expect(home.credentials).toBeNull();
  });

  it("lists nothing on a failed, refused or malformed answer", async () => {
    const home = provider();
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    document.body.append(home);
    await flush();
    expect(home.agents).toEqual([]);

    fetchMock.mockResolvedValueOnce(new Response("no", { status: 500 }));
    await home.refresh();
    expect(home.agents).toEqual([]);

    fetchMock.mockResolvedValueOnce(new Response("{", { status: 200 }));
    await home.refresh();
    expect(home.agents).toEqual([]);

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await home.refresh();
    expect(home.agents).toEqual([]);
    expect(home.agent).toBeNull();
  });

  it("asks nothing without a directory URL", async () => {
    const home = document.createElement(AGENTS_TAG) as AgUiAgents;
    document.body.append(home);
    home.setAttribute("data-agents-url", "");
    await home.refresh();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists again, from scratch, when the URL changes while connected only", async () => {
    const home = provider();
    home.setAttribute("data-agents-url", "/early/");
    expect(fetchMock).not.toHaveBeenCalled();
    document.body.append(home);
    await flush();
    home.setAttribute("data-agents-url", "/other/");
    await flush();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/early/", "/other/"]);
    expect(fetchMock).toHaveBeenLastCalledWith("/other/", { headers: {} });
  });

  it("drops an answer that lands after a disconnect", async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
    const home = provider();
    document.body.append(home);
    home.remove();
    answer(listing([BOARD]));
    await flush();

    expect(home.agents).toEqual([]);
  });
});
