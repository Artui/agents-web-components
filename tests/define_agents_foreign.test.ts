import { describe, expect, it } from "vitest";
import { defineAgents } from "../src/agents/define_agents.js";
import { AGENTS_TAG } from "../src/constants.js";

class OtherAgents extends HTMLElement {}

describe("defineAgents over a tag another class holds", () => {
  it("throws, naming the tag", () => {
    customElements.define(AGENTS_TAG, OtherAgents);

    expect(() => defineAgents()).toThrow(
      new Error(
        `<${AGENTS_TAG}> is already defined by another class: ` +
          "a second copy of this package, or another package, is on the page",
      ),
    );
    expect(customElements.get(AGENTS_TAG)).toBe(OtherAgents);
  });
});
