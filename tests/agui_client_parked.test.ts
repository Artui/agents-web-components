import type { Interrupt, Message } from "@ag-ui/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgUiClient, type AgUiClientHandlers } from "../src/core/agui_client.js";
import { createHttpAgent } from "../src/core/create_http_agent.js";
import recorded from "./fixtures/thread_status.json";

const parked = recorded.listed.body.threads.find((row) => row.thread_id === "t-approve")
  ?.interrupts as Interrupt[];

function handlers(): AgUiClientHandlers & { calls: string[] } {
  const calls: string[] = [];
  const noop = (): void => undefined;
  return {
    calls,
    onRunStart: () => calls.push("start"),
    onMessagesSnapshot: noop,
    onCustomEvent: noop,
    onTextDelta: noop,
    onTextEnd: (text) => calls.push(`end:${text}`),
    onToolCall: noop,
    onToolResult: (id, content) => calls.push(`result:${id}:${content}`),
    onActivity: noop,
    onActivityChanged: noop,
    onReasoningStart: noop,
    onReasoningDelta: noop,
    onReasoningEnd: noop,
    onSubAgentStarted: noop,
    onSubAgentFinished: noop,
    onSubAgentError: noop,
    onRunEnd: () => calls.push("done"),
    onError: (message) => calls.push(`err:${message}`),
    onCancelled: () => calls.push("cancelled"),
    onSettled: () => calls.push("settled"),
  };
}

function stubFetch(): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Promise.resolve(
        new Response(recorded.resumedRun.body, {
          status: recorded.resumedRun.status,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );
    }),
  );
  return bodies;
}

function client(
  resolve: (interrupts: readonly Interrupt[]) => Promise<Record<string, unknown>>,
  detach = false,
): { client: AgUiClient; calls: string[]; saved: () => readonly Message[] } {
  const agent = createHttpAgent({ endpoint: "/agent/" });
  agent.threadId = "t-approve";
  agent.setMessages(recorded.approvalHistory as Message[]);
  const recording = handlers();
  let saved: readonly Message[] = [];
  return {
    client: new AgUiClient({
      agent,
      handlers: recording,
      resolveInterrupts: resolve as never,
      detach: () => detach,
      onPersist: (messages) => {
        saved = messages;
      },
    }),
    calls: recording.calls,
    saved: () => saved,
  };
}

const approve = (interrupts: readonly Interrupt[]) =>
  Promise.resolve(
    Object.fromEntries(
      interrupts.map((interrupt) => [
        interrupt.id,
        { status: "resolved", payload: { approved: true } },
      ]),
    ),
  );

describe("AgUiClient answering a run parked before the page loaded", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([false, true])(
    "sends the person's answer as the resume the server recorded (detach %s)",
    async (detach) => {
      const bodies = stubFetch();
      const made = client(approve, detach);
      await made.client.answerParked(parked);

      expect(bodies).toHaveLength(1);
      expect(bodies[0]?.["resume"]).toEqual(recorded.resumeSent);
      const sent = bodies[0]?.["messages"] as Message[];
      expect(sent.filter((message) => message.role === "tool")).toEqual([]);
      expect(bodies[0]?.["forwardedProps"]).toEqual(detach ? { detach: true } : {});
      expect(made.calls).toContain("result:call-1:deleted invoice-7");
      expect(made.calls).toContain("end:Deleted.");
      const results = made.saved().filter((message) => message.role === "tool");
      expect(results.map((message) => message.content)).toEqual(["deleted invoice-7"]);
    },
  );

  it("leaves the run parked when it is stopped while the person decides", async () => {
    const bodies = stubFetch();
    let decide: (answers: Record<string, unknown>) => void = () => undefined;
    const made = client(() => new Promise((resolve) => (decide = resolve)));
    const answering = made.client.answerParked(parked);
    await Promise.resolve();
    made.client.cancel();
    decide({ "int-call-1": { status: "cancelled" } });
    await answering;

    expect(bodies).toEqual([]);
    expect(made.saved().filter((message) => message.role === "tool")).toEqual([]);
    expect(made.calls).toContain("cancelled");
  });

  it("resumes an interrupt a host hands on without its call", async () => {
    const bodies = stubFetch();
    const bare = parked.map(({ toolCallId: _call, ...rest }) => rest);
    await client(approve).client.answerParked(bare);

    expect(bodies[0]?.["resume"]).toEqual(recorded.resumeSent);
  });

  it("sends nothing without a resolver to ask", async () => {
    const bodies = stubFetch();
    const agent = createHttpAgent({ endpoint: "/agent/" });
    agent.setMessages(recorded.approvalHistory as Message[]);
    await new AgUiClient({ agent, handlers: handlers() }).answerParked(parked);

    expect(bodies).toEqual([]);
  });
});
