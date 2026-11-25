/**
 * A task-controlled delegation's glyph, as a real browser computes it.
 *
 * The spinner rule selects every phase it does not name, so each settled task
 * phase has to be named or its row spins forever. Driven by the recorded runs
 * (`tests/helpers/task_control_fixture.ts`) through the real client, except the
 * open question, which only lasts mid-run.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";
import { SubAgentPanel } from "../../src/ui/progress/subagent_panel.js";
import { subAgentUpdate } from "../../src/ui/progress/subagent_update.js";
import { ToolCallCard } from "../../src/ui/progress/tool_call_card.js";
import { type TaskRun, taskRun, taskStep } from "../helpers/task_control_fixture.js";

const ENDPOINT = "/agent/";

defineChat();

let restore: (() => void) | null = null;

function serve(run: TaskRun): void {
  const original = globalThis.fetch;
  const body = taskRun(run)
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    new URL(String(input), location.href).pathname === ENDPOINT
      ? Promise.resolve(
          new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
        )
      : original(input, init)) as typeof fetch;
  restore = () => {
    globalThis.fetch = original;
  };
}

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", ENDPOINT);
  el.setAttribute("placement", "embedded");
  el.setAttribute("data-tool-display", "full");
  el.style.width = "470px";
  document.body.appendChild(el);
  return el;
}

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function icon(root: ParentNode): HTMLElement {
  const found = root.querySelector(".subagent-icon");
  if (!(found instanceof HTMLElement)) {
    throw new Error("expected a sub-agent icon");
  }
  return found;
}

async function played(run: TaskRun): Promise<AgUiChat> {
  serve(run);
  const el = mount();
  void el.sendMessage("find the passages");
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return el;
}

/** Whether the glyph spins, and what its pseudo-element draws. */
function glyph(found: HTMLElement): { spins: boolean; content: string } {
  return {
    spins: getComputedStyle(found).animationName !== "none",
    content: getComputedStyle(found, "::before").content,
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  restore?.();
  restore = null;
});

describe("a task's glyph (real browser)", () => {
  it("stops spinning on a cancelled task and draws the declined glyph", async () => {
    const el = await played("cancelled");

    expect(glyph(icon(shadow(el)))).toEqual({ spins: false, content: '"⊘"' });
  });

  it("stops spinning on an unfinished task and draws the interrupted glyph", async () => {
    const el = await played("unfinished");

    expect(glyph(icon(shadow(el)))).toEqual({ spins: false, content: '"◌"' });
  });

  it("holds a still accent ring while a question is open, and spins again once answered", () => {
    const el = mount();
    const panel = new SubAgentPanel();
    const card = new ToolCallCard("delegate_task", { agent_name: "researcher" });
    card.subagentSlot.appendChild(panel.element);
    shadow(el).querySelector(".messages")?.appendChild(card.element);
    const asked = subAgentUpdate(taskStep("question", "question"));
    const answered = subAgentUpdate(taskStep("question", "answered"));
    if (asked === null || answered === null) {
      throw new Error("the fixture's own steps did not narrow");
    }

    panel.report(asked);
    const waiting = getComputedStyle(icon(panel.element));
    expect(waiting.animationName).toBe("none");
    expect(waiting.borderTopColor).toBe(waiting.borderLeftColor);

    panel.report(answered);
    expect(glyph(icon(panel.element)).spins).toBe(true);
  });
});
