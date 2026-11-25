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

describe("parseEditorSkill on a scoped server", () => {
  const [personal, shared] = recorded.answers.scopedList.body.skills;

  it("keeps the scope each entry carries", () => {
    expect(parseEditorSkill(personal)).toStrictEqual(personal);
    expect(parseEditorSkill(shared)?.scope).toBe("shared");
  });

  it("passes a scope value it does not know through", () => {
    expect(parseEditorSkill({ ...personal, scope: "team" })?.scope).toBe("team");
  });

  it("adds no scope key when the server sends none", () => {
    expect(parseEditorSkill(CREATED)).not.toHaveProperty("scope");
  });

  it.each([[null], [3], [""], [{ name: "x" }]])(
    "keeps the skill and drops a scope of %j",
    (scope) => {
      const skill = parseEditorSkill({ ...personal, scope });
      expect(skill?.name).toBe("weekly-report");
      expect(skill).not.toHaveProperty("scope");
    },
  );
});
