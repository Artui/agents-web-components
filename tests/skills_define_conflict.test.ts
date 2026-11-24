import { expect, it } from "vitest";
import { defineSkills, SKILLS_TAG } from "../src/skills.js";

it("refuses to register over another class that holds the tag", () => {
  customElements.define(SKILLS_TAG, class extends HTMLElement {});
  expect(() => defineSkills()).toThrow(`<${SKILLS_TAG}> is already defined by another class`);
});
