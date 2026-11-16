import type { A2uiErrorMessage } from "./core/a2ui_error_message.js";

/** How `registerA2ui` is set up. */
export interface A2uiOptions {
  /**
   * Hears each A2UI `error` message a live surface raises, once per distinct
   * error. Neither the A2UI middleware nor django-ag-ui carries an error back
   * to the agent yet, so it goes to the host; the default is `console.warn`.
   */
  readonly onError?: (message: A2uiErrorMessage) => void;
}
