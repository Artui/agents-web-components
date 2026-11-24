import { DEFAULT_SKILL_EDITOR_STRINGS } from "../ui/skill_editor/skill_editor_strings.js";
import type { AgUiSkillsStrings } from "./skills_element_types.js";

/** The element's English text; a host's `strings` is merged over it. */
export const DEFAULT_AG_UI_SKILLS_STRINGS: AgUiSkillsStrings = {
  ...DEFAULT_SKILL_EDITOR_STRINGS,
  back: "Back to the skills",
};
