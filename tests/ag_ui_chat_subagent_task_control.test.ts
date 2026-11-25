/**
 * Task-controlled delegations on the card that delegated, over the real client.
 *
 * Each recorded run is served verbatim as the run's Server-Sent Events, so the
 * real `HttpAgent` decides which keys survive (`SUBAGENT_ERROR`'s `code`
 * included) and the element draws what came through. See
 * `tests/helpers/task_control_fixture.ts` for the provenance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";
import { type TaskRun, taskLifecycle, taskRun, taskStep } from "./helpers/task_control_fixture.js";

defineChat();

function sse(run: TaskRun): Response {
  const body = taskRun(run)
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function stubRun(run: TaskRun): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.body === undefined
        ? new Response(JSON.stringify({ runs: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : sse(run),
    ),
  );
}

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  document.body.appendChild(el);
  return el;
}

async function played(run: TaskRun): Promise<AgUiChat> {
  stubRun(run);
  const el = mount();
  await el.sendMessage("find the passages");
  await settle();
  return el;
}

/** The `index`th delegation panel, in transcript order. */
function panel(el: AgUiChat, index = 0): HTMLElement {
  const found = shadow(el).querySelectorAll<HTMLElement>(".subagent")[index];
  if (found === undefined) {
    throw new Error(`expected delegation panel ${index}`);
  }
  return found;
}

function status(el: AgUiChat): string {
  return panel(el).querySelector(".subagent-status")?.textContent ?? "";
}

function taskId(run: TaskRun, phase: string): string {
  return (taskStep(run, phase)["task"] as Record<string, unknown>)["taskId"] as string;
}

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a task-controlled delegation", () => {
  it("marks a task that ran in the background, and names it", async () => {
    const el = await played("steered");

    expect(panel(el).getAttribute("data-phase")).toBe("finished");
    expect(panel(el).hasAttribute("data-background")).toBe(true);
    expect(panel(el).getAttribute("data-task-id")).toBe(taskId("steered", "steered"));
  });

  it("clears the waiting mark once the question is answered", async () => {
    const el = await played("question");

    expect(panel(el).hasAttribute("data-awaiting-answer")).toBe(false);
    expect(panel(el).getAttribute("data-phase")).toBe("finished");
  });

  it("settles a cancelled task as cancelled, in its own words, not as a failure", async () => {
    const el = await played("cancelled");
    const close = taskLifecycle("cancelled").find((event) => event["type"] === "SUBAGENT_ERROR");

    expect(close?.["code"]).toBe("cancelled");
    expect(panel(el).getAttribute("data-phase")).toBe("cancelled");
    expect(panel(el).getAttribute("data-cancel")).toBe("forced");
    expect(status(el)).toBe(DEFAULT_UI_STRINGS.subAgentCancelled.replace("{agent}", "researcher"));
  });

  it("settles a task the run outlived as unfinished, not as a failure", async () => {
    const el = await played("unfinished");

    expect(panel(el).getAttribute("data-phase")).toBe("unfinished");
    expect(status(el)).toBe(DEFAULT_UI_STRINGS.subAgentUnfinished.replace("{agent}", "researcher"));
  });

  it("draws a resumed task on the call that resumed it, settled on its own", async () => {
    const el = await played("resumed");
    const opened = taskLifecycle("resumed").filter((event) => event["type"] === "SUBAGENT_STARTED");

    expect(new Set(opened.map((event) => event["subagentRunId"])).size).toBe(2);
    expect(shadow(el).querySelectorAll(".subagent")).toHaveLength(2);
    expect(panel(el, 0).getAttribute("data-phase")).toBe("finished");
    expect(panel(el, 1).getAttribute("data-phase")).toBe("finished");
  });

  it("is not stored, so a restored thread draws no task progress", async () => {
    await played("cancelled");
    const stored = Object.keys(sessionStorage)
      .map((key) => sessionStorage.getItem(key) ?? "")
      .join("\n");

    expect(stored).not.toContain(taskStep("cancelled", "backgrounded")["status"] as string);
    expect(stored).not.toContain(taskStep("cancelled", "cancel_requested")["status"] as string);

    document.body.innerHTML = "";
    const restored = mount();
    await settle();

    expect(
      shadow(restored).querySelector('.tool-call[data-tool-name="delegate_task"]'),
    ).not.toBeNull();
    expect(shadow(restored).querySelector(".subagent")).toBeNull();
  });
});

describe("a delegation closed with an error code", () => {
  function closedWith(name: string, message: string, code?: string): (emit: Emit) => void {
    return (emit) => {
      emit.runStart();
      emit.toolCall("call-1", "delegate_task", { agent_name: "researcher" });
      emit.subAgentStarted("subagent-call-1", name, "call-1");
      emit.subAgentError("subagent-call-1", message, code);
    };
  }

  async function settled(script: (emit: Emit) => void): Promise<AgUiChat> {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    const handle = makeFakeAgent({ script });
    el.agentFactory = () => handle.agent;
    document.body.appendChild(el);
    await el.sendMessage("go");
    await settle();
    return el;
  }

  it("fails on a code it does not know, a prototype key included", async () => {
    for (const code of ["exploded", "toString", "constructor"]) {
      document.body.innerHTML = "";
      const el = await settled(closedWith("researcher", "researcher failed", code));

      expect(panel(el).getAttribute("data-phase")).toBe("failed");
      expect(status(el)).toBe("researcher failed");
    }
  });

  it("falls back to the server's words for a cancelled task whose agent is unnamed", async () => {
    const el = await settled(closedWith("", "the task was cancelled", "cancelled"));

    expect(panel(el).getAttribute("data-phase")).toBe("cancelled");
    expect(status(el)).toBe("the task was cancelled");
  });

  it("falls back to the failure line when an unnamed task's close says nothing", async () => {
    const el = await settled(closedWith("", "", "unfinished"));

    expect(panel(el).getAttribute("data-phase")).toBe("unfinished");
    expect(status(el)).toBe(DEFAULT_UI_STRINGS.subAgentFailed);
  });
});
