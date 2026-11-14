import { describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import { defineChat } from "../src/core/define_chat.js";

class OtherChat extends HTMLElement {}

describe("defineChat over a tag another class holds", () => {
  it("throws, naming the tag", () => {
    customElements.define(ELEMENT_TAG, OtherChat);

    expect(() => defineChat()).toThrow(
      new Error(
        `<${ELEMENT_TAG}> is already defined by another class: ` +
          "a second copy of this package, or another package, is on the page",
      ),
    );
    expect(customElements.get(ELEMENT_TAG)).toBe(OtherChat);
  });
});
