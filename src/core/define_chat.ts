import { ELEMENT_TAG } from "../constants.js";
import { AgUiChat } from "./ag_ui_chat.js";

/**
 * Register the `<ag-ui-chat>` Custom Element.
 *
 * Idempotent: a second call, or one after this package's `AgUiChat` already
 * holds the tag, is a no-op. If another class holds the tag it throws naming
 * the tag, because two copies of the element on one page (two bundles, or this
 * package beside its predecessor) would otherwise run the other one. The class
 * is not named: in a minified bundle its name is a one-letter identifier.
 * Registration is an explicit step rather than an import side effect, so
 * importing the package defines nothing and stays tree-shakeable.
 */
export function defineChat(): void {
  const existing = customElements.get(ELEMENT_TAG);
  if (existing === undefined) {
    customElements.define(ELEMENT_TAG, AgUiChat);
  } else if (existing !== AgUiChat) {
    throw new Error(
      `<${ELEMENT_TAG}> is already defined by another class: ` +
        "a second copy of this package, or another package, is on the page",
    );
  }
}
