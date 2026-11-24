// The ./routines entry: the caller's routines, placed away from the chat.

export { ROUTINES_OPEN_THREAD_EVENT, ROUTINES_TAG } from "./constants.js";
export { AgUiRoutines } from "./routines/ag_ui_routines.js";
export { defineRoutines } from "./routines/define_routines.js";
export type {
  AgUiRoutinesStrings,
  AgUiRoutinesStringsInput,
  RoutinesChat,
} from "./routines/types.js";
export type {
  EditorChat,
  EditorOpenThreadDetail,
  EditorProvider,
} from "./ui/standalone/editor_element.js";
