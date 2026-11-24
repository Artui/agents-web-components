import type { AgUiChat } from "../core/ag_ui_chat.js";
import type { RoutinesStrings } from "../ui/routines/routines_strings.js";
import type { EditorChat, EditorStrings } from "../ui/standalone/editor_element.js";

/** Every piece of text `<ag-ui-routines>` draws; set `strings` to translate it. */
export type AgUiRoutinesStrings = RoutinesStrings & EditorStrings;

/** What the `strings` setter takes: any of {@link AgUiRoutinesStrings}. */
export type AgUiRoutinesStringsInput = Partial<AgUiRoutinesStrings>;

/** The part of `<ag-ui-chat>` the routines element reads: its requests, its threads, its conversation. */
export type RoutinesChat = EditorChat & Pick<AgUiChat, "routineSeed">;
