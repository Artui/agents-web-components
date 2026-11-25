/**
 * The sub-agent row's controls, wired through the element: each POST goes to
 * the task route beside `data-threads-url`, for the thread the run streamed in,
 * with the element's own headers and cookie policy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";
import { taskStep, USER_STEP } from "./helpers/task_control_fixture.js";

defineChat();

interface Sent {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function button(el: AgUiChat, selector: string): HTMLButtonElement {
  const found = shadow(el).querySelector<HTMLButtonElement>(selector);
  if (found === null) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

function backgroundTask(emit: Emit): void {
  emit.runStart();
  emit.toolCall("call-1", "delegate_task", { agent_name: "researcher" });
  emit.subAgentStarted("subagent-call-1", "researcher", "call-1");
  emit.custom("ag_ui.subagent", taskStep("steered", "backgrounded"));
}

async function mounted(
  threadsUrl: string | null,
  script: (emit: Emit) => void = backgroundTask,
): Promise<{ el: AgUiChat; sent: Sent[] }> {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      sent.push({ url, init });
      return new Response(JSON.stringify({ steered: true }), { status: 202 });
    }),
  );
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  if (threadsUrl !== null) {
    el.setAttribute("data-threads-url", threadsUrl);
  }
  el.getHeaders = () => ({ "X-CSRFToken": "fresh" });
  const handle = makeFakeAgent({ script });
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  await el.sendMessage("go");
  await settle();
  return { el, sent };
}

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the sub-agent row's task controls", () => {
  it("cancel POSTs to the task's route for the run's thread, with the element's headers", async () => {
    const { el, sent } = await mounted("/agent/threads/");
    const threadId = el.threadId ?? "";
    expect(threadId).not.toBe("");
    const before = sent.length;

    button(el, ".subagent-cancel").click();
    await settle();

    const posted = sent.slice(before);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.url).toBe(
      `/agent/threads/${encodeURIComponent(threadId)}/tasks/task-1/cancel/`,
    );
    expect(posted[0]?.init?.method).toBe("POST");
    expect((posted[0]?.init?.headers as Record<string, string> | undefined)?.["X-CSRFToken"]).toBe(
      "fresh",
    );
    expect(JSON.parse(String(posted[0]?.init?.body))).toEqual({ force: false });
    // Still the stream's state: nothing stamped a cancel.
    expect(shadow(el).querySelector(".subagent")?.hasAttribute("data-cancel")).toBe(false);
  });

  it("draws the user's act only when its step arrives on the stream", async () => {
    const { el } = await mounted("/agent/threads/", (emit) => {
      backgroundTask(emit);
      emit.custom("ag_ui.subagent", USER_STEP.cancel_requested);
    });

    const panel = shadow(el).querySelector(".subagent");
    expect(panel?.getAttribute("data-cancel")).toBe("requested");
    expect(panel?.getAttribute("data-source")).toBe("user");
  });

  it("sends nothing once data-threads-url is gone", async () => {
    const { el, sent } = await mounted("/agent/threads/");
    el.removeAttribute("data-threads-url");
    const before = sent.length;

    button(el, ".subagent-cancel").click();
    await settle();

    expect(sent.slice(before)).toEqual([]);
    expect(shadow(el).querySelector(".subagent-control-error")?.textContent).toBe(
      DEFAULT_UI_STRINGS.subAgentControlFailed,
    );
  });

  it("offers no controls without data-threads-url", async () => {
    const { el } = await mounted(null);

    expect(button(el, ".subagent-cancel").closest<HTMLElement>(".subagent-controls")?.hidden).toBe(
      true,
    );
  });
});
