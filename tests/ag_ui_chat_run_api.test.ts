import type { Context, Message } from "@ag-ui/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, SUBMIT_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type { ClientConversationStore } from "../src/core/conversation_store.js";
import { defineChat } from "../src/core/define_chat.js";
import type { SubmitDetail } from "../src/core/events/submit_detail.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

/**
 * `chat.run` and `chat.registerContext`, read off the body of the request the
 * element's own `HttpAgent` makes: `@ag-ui/client` strips what its schemas do
 * not declare, so only the real client says what reaches the server.
 */

type Body = Record<string, unknown>;

/** A run that calls the frontend tool `pick`, so the client starts a follow-up round. */
const CALLS_PICK = [
  { type: "TOOL_CALL_START", toolCallId: "tc1", toolCallName: "pick" },
  { type: "TOOL_CALL_ARGS", toolCallId: "tc1", delta: "{}" },
  { type: "TOOL_CALL_END", toolCallId: "tc1" },
];

/**
 * Stand in for the AG-UI endpoint and record each run request's body. Run N
 * streams `during[N - 1]`, then a short answer.
 */
function stubEndpoint(...during: readonly (readonly object[])[]): Body[] {
  const bodies: Body[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.body === undefined) {
        return new Response(JSON.stringify({ runs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      bodies.push(JSON.parse(String(init.body)) as Body);
      const n = bodies.length;
      const events = [
        { type: "RUN_STARTED", threadId: "t1", runId: `run-${n}` },
        ...(during[n - 1] ?? []),
        { type: "TEXT_MESSAGE_START", messageId: `a${n}`, role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: `a${n}`, delta: `answer ${n}` },
        { type: "TEXT_MESSAGE_END", messageId: `a${n}` },
        { type: "RUN_FINISHED", threadId: "t1", runId: `run-${n}` },
      ];
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }),
  );
  return bodies;
}

function mount(configure: (el: AgUiChat) => void = () => {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  configure(el);
  document.body.appendChild(el);
  return el;
}

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function userBubbles(el: AgUiChat): string[] {
  return [...shadow(el).querySelectorAll(".message--user")].map((n) => n.textContent ?? "");
}

function submits(el: AgUiChat): string[] {
  const heard: string[] = [];
  el.addEventListener(SUBMIT_EVENT, (event) => {
    heard.push((event as CustomEvent<SubmitDetail>).detail.content);
  });
  return heard;
}

/** Each message a request carried, as its role and text. */
function turns(body: Body | undefined): [unknown, unknown][] {
  return ((body?.["messages"] ?? []) as Message[]).map((m) => [m.role, m.content]);
}

/** Macrotask ticks: the real `HttpAgent` hands events on across timers. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeAll(() => {
  defineChat();
});

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AgUiChat.run", () => {
  it("forwards the props, and draws the message as the user's turn without sending it", async () => {
    const bodies = stubEndpoint();
    const el = mount();
    const heard = submits(el);

    const result = await el.run({ forwardedProps: { action: "approve" }, message: "Approve it" });
    await settle();

    expect(result).toBe(true);
    expect(bodies).toHaveLength(1);
    // The server builds the turn from the props and stores it, so a user
    // message sent beside them would put it in the conversation twice.
    expect(Object.keys(bodies[0] ?? {})).toContain("forwardedProps");
    expect(bodies[0]?.["forwardedProps"]).toEqual({ action: "approve" });
    expect(turns(bodies[0])).toEqual([]);
    expect(userBubbles(el)).toEqual(["Approve it"]);
    expect(heard).toEqual(["Approve it"]);
  });

  it("adds no user message and draws no turn without a message", async () => {
    const bodies = stubEndpoint();
    const el = mount();
    const heard = submits(el);

    const result = await el.run({ forwardedProps: { action: "approve" } });
    await settle();

    expect(result).toBe(true);
    expect(bodies[0]?.["forwardedProps"]).toEqual({ action: "approve" });
    expect(turns(bodies[0])).toEqual([]);
    expect(userBubbles(el)).toEqual([]);
    expect(heard).toEqual([]);
    expect(el.hasAttribute("data-composer-settling")).toBe(false);
    expect(shadow(el).textContent).toContain("answer 1");
  });

  it("forwards nothing on the follow-up round a frontend tool starts", async () => {
    const bodies = stubEndpoint(CALLS_PICK);
    const el = mount((chat) => {
      chat.registerTool({
        name: "pick",
        description: "pick",
        parameters: { type: "object" },
        handler: () => "picked",
      });
    });

    await el.run({ forwardedProps: { action: "approve" } });
    await settle();

    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.["forwardedProps"]).toEqual({ action: "approve" });
    expect(bodies[1]?.["forwardedProps"]).toEqual({});
  });

  it("refuses while a run is in flight", async () => {
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        return new Promise<void>(() => {});
      },
    });
    const el = mount((chat) => {
      chat.agentFactory = () => handle.agent;
    });

    void el.sendMessage("first");
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
    const result = await el.run({ forwardedProps: { action: "approve" }, message: "second" });

    expect(result).toBe(false);
    expect(handle.runParams).toHaveLength(1);
    expect(userBubbles(el)).toEqual(["first"]);
  });

  it("refuses a second run made before the first one's request is made", async () => {
    const bodies = stubEndpoint();
    const el = mount();

    const first = el.run({ forwardedProps: { n: 1 } });
    const second = await el.run({ forwardedProps: { n: 2 } });
    await first;
    await settle();

    expect(second).toBe(false);
    expect(bodies.map((body) => body["forwardedProps"])).toEqual([{ n: 1 }]);
  });

  it("refuses an empty message, as an empty send is refused", async () => {
    const bodies = stubEndpoint();
    const el = mount();

    const result = await el.run({ forwardedProps: { action: "approve" }, message: "" });
    await settle();

    expect(result).toBe(false);
    expect(bodies).toEqual([]);
  });

  it("resolves false with no endpoint, and says why in the transcript", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    document.body.appendChild(el);

    const result = await el.run({ forwardedProps: { action: "approve" } });

    expect(result).toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("no endpoint is set"));
    expect(shadow(el).querySelector(".run-notice--not-connected")).not.toBeNull();
  });

  it("waits behind a restore, then runs with its props after the conversation", async () => {
    const bodies = stubEndpoint();
    let answer: () => void = () => {};
    const store = {
      threadId: () => "t1",
      setActiveThread: () => {},
      saveMessages: () => {},
      loadMessages: () =>
        new Promise<readonly Message[]>((resolve) => {
          answer = () => resolve([{ id: "u0", role: "user", content: "earlier" }]);
        }),
      listThreads: () => Promise.resolve([]),
      clear: () => {},
      saveCheckpoint: () => {},
      loadCheckpoint: () => null,
      renameThread: () => {},
    } as unknown as ClientConversationStore;
    const el = mount((chat) => {
      chat.conversationStore = store;
    });
    await settle();

    const running = el.run({ forwardedProps: { action: "approve" }, message: "now" });
    await settle();
    expect(bodies).toEqual([]);

    answer();
    expect(await running).toBe(true);
    await settle();

    expect(bodies[0]?.["forwardedProps"]).toEqual({ action: "approve" });
    expect(turns(bodies[0])).toEqual([["user", "earlier"]]);
    expect(userBubbles(el)).toEqual(["earlier", "now"]);
  });
});

describe("AgUiChat.registerContext", () => {
  const HOST: Context = { description: "host", value: "from getContext" };
  const FIRST: Context = { description: "first", value: "1" };
  const SECOND: Context = { description: "second", value: "2" };

  it("adds each provider's entries after getContext's, in registration order", async () => {
    const bodies = stubEndpoint();
    const el = mount((chat) => {
      chat.getContext = () => [HOST];
    });
    el.registerContext(() => [FIRST]);
    el.registerContext(() => [SECOND]);

    await el.sendMessage("hi");
    await settle();

    expect(bodies[0]?.["context"]).toEqual([HOST, FIRST, SECOND]);
  });

  it("drops a provider's entries once it is unregistered, and only its own", async () => {
    const bodies = stubEndpoint();
    const el = mount((chat) => {
      chat.getContext = () => [HOST];
    });
    const provider = () => [FIRST];
    const unregister = el.registerContext(provider);
    el.registerContext(provider);
    el.registerContext(() => [SECOND]);

    unregister();
    unregister();
    await el.sendMessage("hi");
    await settle();

    expect(bodies[0]?.["context"]).toEqual([HOST, FIRST, SECOND]);
  });

  it("is read fresh for every round, so a frontend tool's follow-up sees the change", async () => {
    const bodies = stubEndpoint(CALLS_PICK);
    let value = "before";
    const el = mount((chat) => {
      chat.registerTool({
        name: "pick",
        description: "pick",
        parameters: { type: "object" },
        handler: () => {
          value = "after";
          return "picked";
        },
      });
    });
    el.registerContext(() => [{ description: "surface", value }]);

    await el.sendMessage("hi");
    await settle();

    expect(bodies.map((body) => body["context"])).toEqual([
      [{ description: "surface", value: "before" }],
      [{ description: "surface", value: "after" }],
    ]);
  });
});
