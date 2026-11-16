import { describe, expect, it } from "vitest";
import { A2UI_STYLES } from "../src/a2ui/a2ui_styles.js";
import { CORE_STYLES } from "../src/a2ui/core/core_styles.js";
import { DISPLAY_STYLES } from "../src/a2ui/display/display_styles.js";
import { INPUT_STYLES } from "../src/a2ui/inputs/input_styles.js";

describe("A2UI_STYLES", () => {
  it("joins the core, display and input styles in that order", () => {
    expect(A2UI_STYLES).toBe([CORE_STYLES, DISPLAY_STYLES, INPUT_STYLES].join("\n"));
  });

  it("reads no public token, only the private aliases", () => {
    expect(A2UI_STYLES).not.toMatch(/var\(--ag-ui-/);
  });
});
