import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";
import { ToolCallCard } from "../../src/ui/progress/tool_call_card.js";

/**
 * The answered-by mark in a real layout: a fifth child in the card's head row,
 * the longest of its badges, measured at the narrow panel width the head's own
 * suite pins, since happy-dom lays out no boxes.
 */
const PANEL = "400px";

function mount(theme: string | null): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  if (theme !== null) {
    el.setAttribute("theme", theme);
  }
  el.setAttribute("placement", "embedded");
  el.setAttribute("data-tool-display", "full");
  el.style.width = PANEL;
  document.body.appendChild(el);
  return el;
}

function part(root: ParentNode | null, selector: string): HTMLElement {
  const found = root?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

function markedCard(el: AgUiChat): HTMLElement {
  const card = new ToolCallCard("create_event", { title: "Design sync" }, "Create event");
  card.settle("done", "ok", "reviewer:openai:gpt-5");
  part(el.shadowRoot, ".messages").appendChild(card.element);
  return card.element;
}

describe("tool card answered-by mark (real browser)", () => {
  beforeAll(() => {
    defineChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each([null, "classic", "modern"])("sits inside the card under theme %s", (theme) => {
    const card = markedCard(mount(theme));
    const mark = part(card, ".tool-call-answered-by").getBoundingClientRect();
    const box = card.getBoundingClientRect();

    expect(mark.width).toBeGreaterThan(0);
    expect(mark.left).toBeGreaterThanOrEqual(box.left);
    expect(mark.right).toBeLessThanOrEqual(box.right);
  });

  it("reads as a quiet note, like the decision it stands in for", () => {
    const card = markedCard(mount(null));
    const mark = getComputedStyle(part(card, ".tool-call-answered-by"));
    const name = getComputedStyle(part(card, ".tool-call-name"));

    expect(mark.fontStyle).toBe("italic");
    expect(mark.fontSize).toBe("11px");
    expect(mark.color).not.toBe(name.color);
  });
});
