import { describe, expect, it } from "vitest";
import { parseEditorSkill } from "../src/skills/parse_editor_skill.js";
import recorded from "./fixtures/skill_editor.json";

const CREATED = recorded.answers.created.body;

describe("parseEditorSkill", () => {
  it("reads the entry the server's encoder writes", () => {
    expect(parseEditorSkill(CREATED)).toEqual(CREATED);
  });

  it("refuses what is not an object", () => {
    expect(parseEditorSkill(null)).toBeNull();
    expect(parseEditorSkill("skill")).toBeNull();
  });

  it.each(["id", "name", "description", "body", "userInvocable", "modelInvocable", "enabled"])(
    "refuses an entry whose %s is missing",
    (key) => {
      const entry: Record<string, unknown> = { ...CREATED };
      delete entry[key];
      expect(parseEditorSkill(entry)).toBeNull();
    },
  );
});
