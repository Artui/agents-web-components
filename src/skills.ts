// The ./skills entry: the stored-skill editor, placed away from the chat.

export { SKILLS_TAG } from "./constants.js";
export { AgUiSkills } from "./skills/ag_ui_skills.js";
export { defineSkills } from "./skills/define_skills.js";
export type {
  AgUiSkillsStrings,
  AgUiSkillsStringsInput,
  SkillsChat,
} from "./skills/skills_element_types.js";
export type { EditorChat, EditorProvider } from "./ui/standalone/editor_element.js";
