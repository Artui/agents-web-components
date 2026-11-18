import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";

const DESKTOP = { width: 1280, height: 800 };
const STARTERS = JSON.stringify(["Summarise this page"]);
const CLOSE_ENOUGH = 24;

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

function mount(attrs: Record<string, string>): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-starters", STARTERS);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${selector} in the shadow root`);
  }
  return found;
}

/** The distance from the empty region's bottom edge to the composer row's top edge. */
function gapToComposer(el: AgUiChat): number {
  const empty = part(el, ".empty").getBoundingClientRect();
  expect(empty.height).toBeGreaterThan(0);
  return part(el, ".input-row").getBoundingClientRect().top - empty.bottom;
}

beforeAll(() => {
  defineChat();
});

afterEach(() => {
  for (const el of document.querySelectorAll(ELEMENT_TAG)) {
    el.remove();
  }
});

describe("the empty region sits against the composer", () => {
  it("on a page with the greeting off, not centred in the transcript", async () => {
    const el = mount({ placement: "page", "data-greeting": "off" });
    await settle();

    expect(Math.abs(gapToComposer(el))).toBeLessThanOrEqual(CLOSE_ENOUGH);
  });

  it.each([
    ["embedded", { placement: "embedded" }],
    ["floating", { placement: "floating" }],
    ["sidebar", { placement: "sidebar" }],
  ])("in a %s panel without data-greeting", async (_name, attrs) => {
    const el = mount(attrs);
    el.style.height = "560px";
    await settle();

    expect(Math.abs(gapToComposer(el))).toBeLessThanOrEqual(CLOSE_ENOUGH);
  });

  it("moves slotted host content with it", async () => {
    const el = mount({ placement: "page", "data-greeting": "off" });
    const slotted = document.createElement("div");
    slotted.slot = "empty";
    slotted.textContent = "Ask me anything";
    el.appendChild(slotted);
    await settle();

    const composerTop = part(el, ".input-row").getBoundingClientRect().top;
    expect(composerTop - slotted.getBoundingClientRect().bottom).toBeLessThanOrEqual(CLOSE_ENOUGH);
  });

  it("with the greeting on, over the centred composer rather than at the foot", async () => {
    const el = mount({ placement: "page", "user-name": "Ada" });
    await settle();

    expect(Math.abs(gapToComposer(el))).toBeLessThanOrEqual(CLOSE_ENOUGH);
    const chat = part(el, ".chat").getBoundingClientRect();
    expect(chat.bottom - part(el, ".input-row").getBoundingClientRect().bottom).toBeGreaterThan(60);
  });

  it("on a phone, with the prompts against the composer under a greeting above them", async () => {
    await page.viewport(390, 844);
    try {
      const el = mount({ placement: "page", "user-name": "Ada" });
      await settle();

      expect(Math.abs(gapToComposer(el))).toBeLessThanOrEqual(CLOSE_ENOUGH);
      const greeting = part(el, ".greeting").getBoundingClientRect();
      const empty = part(el, ".empty").getBoundingClientRect();
      expect(greeting.top).toBeGreaterThan(empty.top + 20);
      expect(greeting.bottom).toBeLessThan(empty.bottom - 20);
    } finally {
      await page.viewport(DESKTOP.width, DESKTOP.height);
    }
  });
});
