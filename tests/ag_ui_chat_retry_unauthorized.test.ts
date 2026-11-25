import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiAgents } from "../src/agents/ag_ui_agents.js";
import { defineAgents } from "../src/agents/define_agents.js";
import { AGENTS_TAG, ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type { HttpAgentOptions } from "../src/core/create_http_agent.js";
import { defineChat } from "../src/core/define_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";
import { taskStep } from "./helpers/task_control_fixture.js";

defineChat();
defineAgents();

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function unauthorized(): Response {
  return new Response(JSON.stringify({ detail: "expired" }), { status: 401 });
}

function rotating(): () => Record<string, string> {
  let issued = 0;
  return () => {
    issued += 1;
    return { Authorization: `Bearer t${issued}` };
  };
}

function callsTo(url: string): (string | null)[] {
  return fetchMock.mock.calls
    .filter(([to]) => to === url)
    .map(([, init]) => new Headers(init?.headers).get("Authorization"));
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function chat(retry: boolean): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.getHeaders = rotating();
  el.retryUnauthorized = retry;
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("<ag-ui-chat> retryUnauthorized", () => {
  it("is off by default and reflects data-retry-unauthorized", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    expect(el.retryUnauthorized).toBe(false);
    el.retryUnauthorized = true;
    expect(el.hasAttribute("data-retry-unauthorized")).toBe(true);
    el.removeAttribute("data-retry-unauthorized");
    expect(el.retryUnauthorized).toBe(false);
  });

  it("sends a GET through request() again with the refreshed header", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(new Response("{}"));

    const response = await chat(true).request("/agent/routines/");

    expect(response.status).toBe(200);
    expect(callsTo("/agent/routines/")).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("sends a GET once without the opt-in, and hands back the 401", async () => {
    fetchMock.mockResolvedValue(unauthorized());

    const response = await chat(false).request("/agent/routines/");

    expect(response.status).toBe(401);
    expect(callsTo("/agent/routines/")).toEqual(["Bearer t1"]);
  });

  it("sends a HEAD through request() again", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(new Response(null));

    await chat(true).request("/agent/routines/", { method: "HEAD" });

    expect(callsTo("/agent/routines/")).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("hands the thread list's opt-in to its store, read per request", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ threads: [] })));
    const el = chat(false);
    el.setAttribute("data-threads-url", "/agent/threads/");
    el.agentFactory = () => makeFakeAgent({ script: () => undefined }).agent;
    document.body.appendChild(el);
    await settle();
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValue(new Response(JSON.stringify({ threads: [] })));
    el.retryUnauthorized = true;

    await el.conversationStore.listThreads();

    expect(callsTo("/agent/threads/")).toHaveLength(2);
  });

  it("hands the agent factory a live retryUnauthorized", async () => {
    let options: HttpAgentOptions | null = null;
    const el = chat(true);
    el.agentFactory = (given) => {
      options = given;
      return makeFakeAgent({ script: () => undefined }).agent;
    };
    document.body.appendChild(el);
    await el.sendMessage("hello");

    const live = (options as HttpAgentOptions | null)?.retryUnauthorized;
    expect(live?.()).toBe(true);
    el.retryUnauthorized = false;
    expect(live?.()).toBe(false);
  });

  it("asks the run index again", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValue(new Response(JSON.stringify({ runs: [] })));
    const el = chat(true);
    el.setAttribute("data-runs-url", "/agent/runs/");
    el.agentFactory = () => makeFakeAgent({ script: () => undefined }).agent;
    document.body.appendChild(el);
    el.openCheckpoints();
    await settle();

    expect(callsTo("/agent/runs/")).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("probes a thread's run log again under data-detach-runs", async () => {
    fetchMock.mockImplementation(async (url) =>
      url.includes("/events/")
        ? unauthorized()
        : new Response(JSON.stringify({ threads: [], messages: [] })),
    );
    const el = chat(true);
    el.setAttribute("data-threads-url", "/agent/threads/");
    el.setAttribute("data-detach-runs", "");
    el.agentFactory = () => makeFakeAgent({ script: () => undefined }).agent;
    document.body.appendChild(el);
    await settle();

    await el.switchThread("t1");
    await settle();

    expect(callsTo("/agent/threads/t1/events/?after=0&limit=1")).toHaveLength(2);
  });

  it("never repeats a write through request()", async () => {
    fetchMock.mockResolvedValue(unauthorized());
    const el = chat(true);

    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      await el.request("/agent/routines/r1/", { method, body: "{}" });
    }

    expect(callsTo("/agent/routines/r1/")).toHaveLength(4);
  });

  it("asks the tool catalog again", async () => {
    fetchMock.mockImplementation(async () => unauthorized());
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(new Response("{}"));
    const el = chat(true);
    el.setAttribute("data-tools-url", "/agent/tools/");
    el.agentFactory = () => makeFakeAgent({ script: () => undefined }).agent;
    document.body.appendChild(el);
    await settle();

    expect(callsTo("/agent/tools/")).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("sends the run POST once over the real client", async () => {
    fetchMock.mockImplementation(async () => unauthorized());
    const el = chat(true);
    document.body.appendChild(el);

    await el.sendMessage("hello");
    await settle();

    expect(fetchMock.mock.calls.filter(([url]) => url === "/agent/")).toHaveLength(1);
  });

  it("sends a task's cancel POST once", async () => {
    const backgroundTask = (emit: Emit): void => {
      emit.runStart();
      emit.toolCall("call-1", "delegate_task", { agent_name: "researcher" });
      emit.subAgentStarted("subagent-call-1", "researcher", "call-1");
      emit.custom("ag_ui.subagent", taskStep("steered", "backgrounded"));
    };
    fetchMock.mockImplementation(async () => unauthorized());
    const el = chat(true);
    el.setAttribute("data-threads-url", "/agent/threads/");
    el.agentFactory = () => makeFakeAgent({ script: backgroundTask }).agent;
    document.body.appendChild(el);
    await el.sendMessage("go");
    await settle();

    el.shadowRoot?.querySelector<HTMLButtonElement>(".subagent-cancel")?.click();
    await settle();

    const cancels = fetchMock.mock.calls.filter(([url]) => url.endsWith("/tasks/task-1/cancel/"));
    expect(cancels).toHaveLength(1);
  });
});

describe("<ag-ui-agents> retryUnauthorized", () => {
  function provider(retry: boolean): AgUiAgents {
    const el = document.createElement(AGENTS_TAG) as AgUiAgents;
    el.setAttribute("data-agents-url", "/home/agents/");
    el.getHeaders = rotating();
    el.retryUnauthorized = retry;
    return el;
  }

  it("is off by default and reflects data-retry-unauthorized", () => {
    const el = document.createElement(AGENTS_TAG) as AgUiAgents;
    expect(el.retryUnauthorized).toBe(false);
    el.retryUnauthorized = true;
    expect(el.hasAttribute("data-retry-unauthorized")).toBe(true);
    el.retryUnauthorized = false;
    expect(el.hasAttribute("data-retry-unauthorized")).toBe(false);
  });

  it("lists the directory again with the refreshed header", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] })));

    await provider(true).refresh();

    expect(callsTo("/home/agents/")).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("lists once without the opt-in", async () => {
    fetchMock.mockResolvedValue(unauthorized());

    await provider(false).refresh();

    expect(callsTo("/home/agents/")).toEqual(["Bearer t1"]);
  });

  it("follows the inbox stream again after a 401", async () => {
    fetchMock.mockImplementation(async (url) =>
      url === "/home/inbox/" ? unauthorized() : new Response(JSON.stringify({ agents: [] })),
    );
    const el = provider(true);
    el.setAttribute("data-inbox-url", "/home/inbox/");
    el.setAttribute("data-inbox-transport", "stream");
    document.body.appendChild(el);
    await settle();
    el.remove();

    expect(callsTo("/home/inbox/")).toEqual(["Bearer t2", "Bearer t3"]);
  });

  it("repeats a GET through request() and never a write", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValue(new Response("{}"));
    const el = provider(true);
    await el.request("/home/skills/");
    fetchMock.mockResolvedValue(unauthorized());
    await el.request("/home/skills/s1/", { method: "PATCH", body: "{}" });

    expect(callsTo("/home/skills/")).toEqual(["Bearer t1", "Bearer t2"]);
    expect(callsTo("/home/skills/s1/")).toEqual(["Bearer t3"]);
  });
});
