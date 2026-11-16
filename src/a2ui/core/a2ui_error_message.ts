import type { A2uiError } from "./a2ui_error.js";

/** A2UI 1.0's renderer-to-agent `error` message, whole. */
export interface A2uiErrorMessage {
  readonly version: "1.0";
  readonly error: A2uiError;
}
