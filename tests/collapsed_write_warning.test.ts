import { afterEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";

defineChat();

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a refused collapsed write", () => {
  it("warns once per element however often the panel is toggled", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-start-open", "");
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const real = sessionStorage;
    vi.stubGlobal(
      "sessionStorage",
      new Proxy(real, {
        get(target, property) {
          if (property === "setItem") {
            return () => {
              throw new DOMException("exceeded the quota", "QuotaExceededError");
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    );

    for (const collapsed of [true, false, true, false, true]) {
      el.setCollapsed(collapsed);
    }

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
