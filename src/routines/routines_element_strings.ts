import { DEFAULT_ROUTINES_STRINGS } from "../ui/routines/routines_strings.js";
import type { AgUiRoutinesStrings } from "./types.js";

/** The element's English text; a host's `strings` is merged over it. */
export const DEFAULT_AG_UI_ROUTINES_STRINGS: AgUiRoutinesStrings = {
  ...DEFAULT_ROUTINES_STRINGS,
  back: "Back to the routines",
};
