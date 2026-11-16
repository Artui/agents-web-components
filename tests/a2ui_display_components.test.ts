import { describe, expect, it } from "vitest";
import { DISPLAY_COMPONENTS } from "../src/a2ui/display/display_components.js";

describe("DISPLAY_COMPONENTS", () => {
  it("names the eight display components of the basic catalog", () => {
    expect(Object.keys(DISPLAY_COMPONENTS).sort()).toEqual([
      "Card",
      "Column",
      "Divider",
      "Icon",
      "Image",
      "List",
      "Row",
      "Text",
    ]);
  });
});
