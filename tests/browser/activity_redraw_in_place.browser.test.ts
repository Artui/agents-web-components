import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { ActivityRenderContext } from "../../src/core/activity_render_context.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";
import { type Emit, makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * An activity renderer that returns the node it drew last keeps it on screen,
 * with what the user typed into it and the focus it had.
 *
 * In the browser because focus and a typed value are what is at stake, and
 * because a replace that moved the same node back into its own place would keep
 * both identity and value: only the focus and the mutation record tell the
 * node left alone apart from one taken out and put back.
 */

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

/** A form surface: a label the content sets, and a field the user fills. */
function renderForm(content: unknown, context?: ActivityRenderContext): Node {
  const label = (content as { label: string }).label;
  const previous = context?.previous;
  if (previous instanceof HTMLElement) {
    (previous.querySelector(".form-label") as HTMLElement).textContent = label;
    return previous;
  }
  const box = document.createElement("div");
  box.className = "form-activity";
  const caption = document.createElement("span");
  caption.className = "form-label";
  caption.textContent = label;
  const input = document.createElement("input");
  input.className = "form-input";
  box.append(caption, input);
  return box;
}

beforeAll(() => {
  defineChat();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("an activity redrawn under the same message id", () => {
  it("keeps the node, its typed value and its focus when the renderer returns previous", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const script = async (emit: Emit): Promise<void> => {
      emit.runStart();
      emit.activity("form", { label: "Step 1" }, "f1");
      await gate;
      emit.activityReplace("form", { label: "Step 2" }, "f1");
      emit.runEnd();
    };
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("placement", "embedded");
    el.style.width = "470px";
    el.style.height = "640px";
    el.agentFactory = () => makeFakeAgent({ script }).agent;
    el.registerActivityRenderer({ type: "form", render: renderForm });
    document.body.appendChild(el);

    void el.sendMessage("open the form");
    await settle();
    const box = shadow(el).querySelector(".form-activity") as HTMLElement;
    const input = box.querySelector(".form-input") as HTMLInputElement;
    expect(input.getBoundingClientRect().width).toBeGreaterThan(0);
    await userEvent.click(input);
    await userEvent.keyboard("typed by the user");
    expect(shadow(el).activeElement).toBe(input);
    const removed: Node[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        removed.push(...record.removedNodes);
      }
    });
    observer.observe(box.parentNode as Node, { childList: true });

    release();
    await settle();
    observer.disconnect();

    const boxes = shadow(el).querySelectorAll(".form-activity");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toBe(box);
    expect(box.querySelector(".form-label")?.textContent).toBe("Step 2");
    expect(input.value).toBe("typed by the user");
    expect(shadow(el).activeElement).toBe(input);
    expect(removed).not.toContain(box);
  });
});
