import { beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";

describe("defineChat", () => {
  beforeEach(() => {
    // happy-dom gives each test file a fresh window, but within this file the
    // registry persists across tests — that is exactly what we want to assert.
  });

  it("registers the element on first call and is idempotent", () => {
    expect(customElements.get(ELEMENT_TAG)).toBeUndefined();

    defineChat();
    expect(customElements.get(ELEMENT_TAG)).toBe(AgUiChat);

    // Second call must be a no-op (does not throw on re-definition).
    expect(() => defineChat()).not.toThrow();
    expect(customElements.get(ELEMENT_TAG)).toBe(AgUiChat);
  });
});
