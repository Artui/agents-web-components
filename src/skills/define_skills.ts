import { SKILLS_TAG } from "../constants.js";
import { AgUiSkills } from "./ag_ui_skills.js";

/**
 * Register the `<ag-ui-skills>` Custom Element.
 *
 * Idempotent, and throws naming the tag when another class holds it, as
 * `defineChat` does and for the same reason: two copies on one page.
 */
export function defineSkills(): void {
  const existing = customElements.get(SKILLS_TAG);
  if (existing === undefined) {
    customElements.define(SKILLS_TAG, AgUiSkills);
  } else if (existing !== AgUiSkills) {
    throw new Error(
      `<${SKILLS_TAG}> is already defined by another class: ` +
        "a second copy of this package, or another package, is on the page",
    );
  }
}
