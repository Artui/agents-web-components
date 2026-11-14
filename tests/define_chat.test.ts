import { describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";

// happy-dom gives each file a fresh registry, and these two need different ones.
describe("defineChat", () => {
  it("registers the element on first call and is idempotent", () => {
    expect(customElements.get(ELEMENT_TAG)).toBeUndefined();

    defineChat();
    expect(customElements.get(ELEMENT_TAG)).toBe(AgUiChat);

    expect(() => defineChat()).not.toThrow();
    expect(customElements.get(ELEMENT_TAG)).toBe(AgUiChat);
  });
});
