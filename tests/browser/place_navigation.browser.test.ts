import { afterEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";

defineChat();

const START = window.location.href;

function label(el: AgUiChat): string | null {
  return el.shadowRoot?.querySelector(".place-label")?.textContent ?? null;
}

describe("the place chip under the Navigation API (real browser)", () => {
  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    history.replaceState(null, "", START);
  });

  it("follows a pushState move with no focus, expand or run", () => {
    expect("navigation" in window).toBe(true);
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("placement", "floating");
    el.routeMap = [
      { id: "orders", path: "/orders", title: "Orders" },
      { id: "billing", path: "/billing", title: "Billing" },
    ];
    document.body.append(el);
    history.pushState(null, "", "/orders");
    el.refreshPlace();
    expect(label(el)).toBe("Orders");

    history.pushState(null, "", "/billing");

    expect(label(el)).toBe("Billing");
  });

  it("stops following once the chat is disconnected", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    let refreshes = 0;
    el.refreshPlace = () => {
      refreshes += 1;
    };
    document.body.append(el);
    history.pushState(null, "", "/orders");
    expect(refreshes).toBeGreaterThan(0);
    el.remove();
    const before = refreshes;

    history.pushState(null, "", "/billing");

    expect(refreshes).toBe(before);
  });
});
