import { describe, expect, it } from "vitest";
import { AgUiSkills, defineSkills, SKILLS_TAG } from "../src/skills.js";

describe("defineSkills", () => {
  it("registers the element once, idempotently", () => {
    defineSkills();
    defineSkills();
    expect(customElements.get(SKILLS_TAG)).toBe(AgUiSkills);
  });
});
