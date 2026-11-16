import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { A2UI_CATALOG } from "../src/a2ui/a2ui_catalog.js";

const COMMITTED = JSON.parse(readFileSync("a2ui/v1/catalog.json", "utf8")) as unknown;

describe("the A2UI catalog", () => {
  it("is the committed catalog.json the catalog id names", () => {
    expect(A2UI_CATALOG).toEqual(COMMITTED);
    expect(A2UI_CATALOG.catalogId).toBe(
      "https://raw.githubusercontent.com/Artui/agents-web-components/main/a2ui/v1/catalog.json",
    );
  });

  it("declares protocol 1.0, or the server falls back to v0.9 and rejects @path", () => {
    expect(A2UI_CATALOG.protocolVersion).toBe("1.0");
  });

  it("names the twelve components and fourteen functions of the basic catalog it draws", () => {
    expect(Object.keys(A2UI_CATALOG.components)).toEqual([
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
    ]);
    expect(Object.keys(A2UI_CATALOG.functions)).toHaveLength(14);
  });

  it("puts properties and required at each component's top level, where the validator reads them", () => {
    for (const schema of Object.values(A2UI_CATALOG.components)) {
      expect(schema).not.toHaveProperty("allOf");
      expect(schema.properties).toBeTypeOf("object");
      expect(Array.isArray(schema.required)).toBe(true);
    }
    expect(A2UI_CATALOG.components.Button.required).toEqual(["child", "action"]);
  });

  it("stays well inside the context budget", () => {
    // Posted on every run; measured at 12,143 characters.
    expect(JSON.stringify(A2UI_CATALOG).length).toBeLessThan(13_000);
  });
});
