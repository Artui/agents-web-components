import type { UiStrings } from "../ui_strings.js";

/** The text the skill editor and its form draw: a slice of the chat's {@link UiStrings}. */
export type SkillEditorStrings = Pick<
  UiStrings,
  | "cancel"
  | "create"
  | "draftSkill"
  | "editSkillTitle"
  | "newSkill"
  | "newSkillTitle"
  | "noSkills"
  | "noSkillsBody"
  | "save"
  | "skillAgentMayLoad"
  | "skillAgentMayLoadHint"
  | "skillBody"
  | "skillBodyHint"
  | "skillDescription"
  | "skillDescriptionHint"
  | "skillInMenu"
  | "skillInMenuHint"
  | "skillName"
  | "skillNameHint"
  | "skillOff"
  | "skillReach"
  | "skillSaveFailed"
  | "skillSaved"
  | "skillTurnedOff"
  | "skillTurnedOn"
  | "skillUnreachable"
  | "skills"
  | "skillsUnavailable"
  | "turnOff"
  | "turnOn"
  | "writeSkill"
  | `skillScope:${string}`
>;

/**
 * The skill editor's English text, the same values as the chat's table (a
 * test holds them equal), kept apart so an editor element ships without that table.
 */
export const DEFAULT_SKILL_EDITOR_STRINGS: SkillEditorStrings = {
  cancel: "Cancel",
  create: "Create",
  draftSkill: "Draft one with the agent",
  editSkillTitle: "Edit skill",
  newSkill: "New skill",
  newSkillTitle: "New skill",
  noSkills: "No skills yet",
  noSkillsBody:
    "A skill is a set of instructions you or the agent can call up by name, like {example}.",
  save: "Save",
  skillAgentMayLoad: "Agent may load it on its own",
  skillAgentMayLoadHint: "When the description matches the request.",
  skillBody: "Instructions",
  skillBodyHint: "Markdown. A skill grants no tools: approvals still apply.",
  skillDescription: "Description",
  skillDescriptionHint:
    "The agent reads only this until it loads the skill, so say when to use it.",
  skillInMenu: "In the / menu",
  skillInMenuHint: "You pick it from the palette.",
  skillName: "Name",
  skillNameHint: "Lowercase words joined by hyphens. It is what you type after /.",
  skillOff: "Off",
  skillReach: "Who can use it",
  skillSaveFailed: "The skill could not be saved.",
  skillSaved: "Saved /{name}",
  skillTurnedOff: "/{name} is off",
  skillTurnedOn: "/{name} is on again",
  skillUnreachable:
    "With both off nobody can reach this skill. Turn it off instead if that is the intent.",
  skills: "Skills",
  skillsUnavailable: "Skills could not be loaded.",
  turnOff: "Turn off",
  turnOn: "Turn on",
  writeSkill: "Write it yourself",
  "skillScope:personal": "Personal",
  "skillScope:shared": "Company",
};
