import { expect, it } from "vitest";
import { defineRoutines, ROUTINES_TAG } from "../src/routines.js";

it("refuses to register over another class that holds the tag", () => {
  customElements.define(ROUTINES_TAG, class extends HTMLElement {});
  expect(() => defineRoutines()).toThrow(`<${ROUTINES_TAG}> is already defined by another class`);
});
