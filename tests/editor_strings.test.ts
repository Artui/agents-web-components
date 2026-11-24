import { describe, expect, it } from "vitest";
import { DEFAULT_AG_UI_ROUTINES_STRINGS } from "../src/routines/routines_element_strings.js";
import { DEFAULT_AG_UI_SKILLS_STRINGS } from "../src/skills/skills_element_strings.js";
import { DEFAULT_ROUTINES_STRINGS } from "../src/ui/routines/routines_strings.js";
import { DEFAULT_SKILL_EDITOR_STRINGS } from "../src/ui/skill_editor/skill_editor_strings.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

describe("the editor views' own defaults", () => {
  it.each([
    ["routines", DEFAULT_ROUTINES_STRINGS],
    ["skill editor", DEFAULT_SKILL_EDITOR_STRINGS],
  ])("match the chat's English for every %s key", (_, defaults) => {
    const keys = Object.keys(defaults);
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect([key, defaults[key as keyof typeof defaults]]).toEqual([
        key,
        DEFAULT_UI_STRINGS[key as keyof typeof DEFAULT_UI_STRINGS],
      ]);
    }
  });

  it("add only the back arrow's label in each element", () => {
    expect(DEFAULT_AG_UI_ROUTINES_STRINGS).toEqual({
      ...DEFAULT_ROUTINES_STRINGS,
      back: "Back to the routines",
    });
    expect(DEFAULT_AG_UI_SKILLS_STRINGS).toEqual({
      ...DEFAULT_SKILL_EDITOR_STRINGS,
      back: "Back to the skills",
    });
  });
});
