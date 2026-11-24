import { ROUTINES_TAG } from "../constants.js";
import { AgUiRoutines } from "./ag_ui_routines.js";

/**
 * Register the `<ag-ui-routines>` Custom Element.
 *
 * Idempotent, and throws naming the tag when another class holds it, as
 * `defineChat` does and for the same reason: two copies on one page.
 */
export function defineRoutines(): void {
  const existing = customElements.get(ROUTINES_TAG);
  if (existing === undefined) {
    customElements.define(ROUTINES_TAG, AgUiRoutines);
  } else if (existing !== AgUiRoutines) {
    throw new Error(
      `<${ROUTINES_TAG}> is already defined by another class: ` +
        "a second copy of this package, or another package, is on the page",
    );
  }
}
