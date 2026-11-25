/**
 * A running task's controls, laid out by a real browser: inside the card that
 * delegated at the narrow end, hidden when hidden, and legible when filled.
 */

import { afterEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";
import { SubAgentPanel } from "../../src/ui/progress/subagent_panel.js";
import { subAgentUpdate } from "../../src/ui/progress/subagent_update.js";
import { ToolCallCard } from "../../src/ui/progress/tool_call_card.js";
import { taskStep } from "../helpers/task_control_fixture.js";

defineChat();

function mount(width: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.setAttribute("data-tool-display", "full");
  el.style.width = width;
  document.body.appendChild(el);
  return el;
}

function panelIn(el: AgUiChat): { panel: SubAgentPanel; card: ToolCallCard } {
  const panel = new SubAgentPanel(undefined, {
    available: () => true,
    send: async () => ({ ok: true }),
  });
  const card = new ToolCallCard("delegate_task", { agent_name: "researcher" });
  card.subagentSlot.appendChild(panel.element);
  el.shadowRoot?.querySelector(".messages")?.appendChild(card.element);
  for (const phase of ["backgrounded", "question"]) {
    const update = subAgentUpdate(taskStep("question", phase));
    if (update !== null) {
      panel.report(update);
    }
  }
  return { panel, card };
}

function part(panel: SubAgentPanel, selector: string): HTMLElement {
  const found = panel.element.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a task's controls in the browser", () => {
  it("stay inside the delegating card at 240px, the reply field included", () => {
    const el = mount("240px");
    const { panel, card } = panelIn(el);
    part(panel, ".subagent-answer").click();
    const box = card.element.getBoundingClientRect();

    for (const selector of [
      ".subagent-question",
      ".subagent-steer",
      ".subagent-answer",
      ".subagent-cancel",
      ".subagent-reply-input",
      ".subagent-reply-send",
    ]) {
      const rect = part(panel, selector).getBoundingClientRect();
      expect(rect.width, selector).toBeGreaterThan(0);
      expect(rect.left, selector).toBeGreaterThanOrEqual(box.left - 0.5);
      expect(rect.right, selector).toBeLessThanOrEqual(box.right + 0.5);
    }
  });

  it("take no room while hidden", () => {
    const el = mount("470px");
    const { panel } = panelIn(el);

    for (const selector of [".subagent-reply", ".subagent-control-error"]) {
      expect(getComputedStyle(part(panel, selector)).display, selector).toBe("none");
    }
    part(panel, ".subagent-steer").click();
    expect(getComputedStyle(part(panel, ".subagent-reply")).display).toBe("flex");

    const settled = subAgentUpdate({ ...taskStep("question", "answered") });
    if (settled !== null) {
      panel.report({ ...settled, phase: "finished", task: null });
    }
    expect(getComputedStyle(part(panel, ".subagent-controls")).display).toBe("none");
    expect(part(panel, ".subagent-controls").getBoundingClientRect().height).toBe(0);
  });

  it("draw the filled answer button in two different colours", () => {
    const el = mount("470px");
    const { panel } = panelIn(el);
    const answer = part(panel, ".subagent-answer");
    answer.click();
    const style = getComputedStyle(answer);

    expect(style.display).not.toBe("none");
    expect(style.color).not.toBe(style.backgroundColor);
  });
});
