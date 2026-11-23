import { describe, expect, it } from "vitest";
import { AgUiAgents } from "../src/agents/ag_ui_agents.js";
import { defineAgents } from "../src/agents/define_agents.js";
import { AGENTS_TAG } from "../src/constants.js";

describe("defineAgents", () => {
  it("registers the provider once, and again is a no-op", () => {
    defineAgents();
    defineAgents();

    expect(customElements.get(AGENTS_TAG)).toBe(AgUiAgents);
  });
});
