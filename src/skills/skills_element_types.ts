import type { AgUiChat } from "../core/ag_ui_chat.js";
import type { SkillEditorStrings } from "../ui/skill_editor/skill_editor_strings.js";
import type { EditorChat, EditorStrings } from "../ui/standalone/editor_element.js";

/** Every piece of text `<ag-ui-skills>` draws; set `strings` to translate it. */
export type AgUiSkillsStrings = SkillEditorStrings & EditorStrings;

/** What the `strings` setter takes: any of {@link AgUiSkillsStrings}. */
export type AgUiSkillsStringsInput = Partial<AgUiSkillsStrings>;

/** The part of `<ag-ui-chat>` the skills element drives: its requests, its catalog, its composer. */
export type SkillsChat = EditorChat & Pick<AgUiChat, "refreshSkills" | "sendMessage">;
