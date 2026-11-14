import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG, ICON_MOON, ICON_SUN } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";

/**
 * The theme toggle offers the way out of the drawn scheme, whoever set it.
 *
 * Chromium, because a theme without a scheme word is answered from the
 * computed color-scheme, which happy-dom does not resolve from the shadow styles.
 */

function mount(theme: string | null): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "floating");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-theme-toggle", "");
  if (theme !== null) {
    el.setAttribute("theme", theme);
  }
  document.body.appendChild(el);
  return el;
}

function shape(markup: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  return [...holder.querySelectorAll("path, circle")].map((n) => n.outerHTML).join("|");
}

function shown(el: AgUiChat): string {
  const toggle = el.shadowRoot?.querySelector(".header-btn--theme svg.glyph");
  if (toggle === null || toggle === undefined) {
    throw new Error("expected the theme toggle's glyph");
  }
  return [...toggle.querySelectorAll("path, circle")].map((n) => n.outerHTML).join("|");
}

describe("the theme toggle's glyph follows a scheme set from outside", () => {
  beforeAll(() => {
    defineChat();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it.each([
    { from: null, to: "dark", glyph: ICON_SUN },
    { from: null, to: "soft dark", glyph: ICON_SUN },
    { from: "dark", to: "light", glyph: ICON_MOON },
    { from: "dark", to: "soft", glyph: ICON_MOON },
    { from: "soft dark", to: null, glyph: ICON_MOON },
  ])("redraws when theme goes from $from to $to", ({ from, to, glyph }) => {
    const el = mount(from);
    expect(getComputedStyle(el).colorScheme).toBe(from?.includes("dark") ? "dark" : "light");
    if (to === null) {
      el.removeAttribute("theme");
    } else {
      el.setAttribute("theme", to);
    }
    expect(getComputedStyle(el).colorScheme).toBe(glyph === ICON_SUN ? "dark" : "light");
    expect(shown(el)).toBe(shape(glyph));
  });

  it("still flips the glyph on the toggle's own click", () => {
    const el = mount(null);
    el.toggleTheme();
    expect(el.getAttribute("theme")).toBe("dark");
    expect(shown(el)).toBe(shape(ICON_SUN));
    el.toggleTheme();
    expect(shown(el)).toBe(shape(ICON_MOON));
  });

  it("is drawn from the theme set before the element connects", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("theme", "dark");
    el.setAttribute("data-theme-toggle", "");
    el.setAttribute("endpoint", "/agent/");
    document.body.appendChild(el);
    expect(shown(el)).toBe(shape(ICON_SUN));
  });

  it("leaves a panel without the toggle alone", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    document.body.appendChild(el);
    el.setAttribute("theme", "dark");
    expect(el.shadowRoot?.querySelector(".header-btn--theme")).toBeNull();
  });
});
