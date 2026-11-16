import { describe, expect, it } from "vitest";
import { CATALOG_COMPONENTS } from "../src/a2ui/catalog_components.js";
import { BASIC_FUNCTIONS } from "../src/a2ui/functions/basic_functions.js";

const COMPONENTS = [
  "Text",
  "Image",
  "Icon",
  "Row",
  "Column",
  "List",
  "Card",
  "Divider",
  "Button",
  "TextField",
  "CheckBox",
  "ChoicePicker",
];
const FUNCTIONS = [
  "required",
  "regex",
  "length",
  "numeric",
  "email",
  "formatString",
  "formatNumber",
  "formatCurrency",
  "formatDate",
  "pluralize",
  "openUrl",
  "and",
  "or",
  "not",
];

describe("the catalog tables", () => {
  it("draws every component of the catalog, and nothing else", () => {
    expect(Object.keys(CATALOG_COMPONENTS).sort()).toEqual([...COMPONENTS].sort());
  });

  it("runs every function of the catalog, and nothing else", () => {
    expect(Object.keys(BASIC_FUNCTIONS).sort()).toEqual([...FUNCTIONS].sort());
  });
});
