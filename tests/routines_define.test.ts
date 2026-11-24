import { describe, expect, it } from "vitest";
import { AgUiRoutines, defineRoutines, ROUTINES_TAG } from "../src/routines.js";

describe("defineRoutines", () => {
  it("registers the element once, idempotently", () => {
    defineRoutines();
    defineRoutines();
    expect(customElements.get(ROUTINES_TAG)).toBe(AgUiRoutines);
  });
});
