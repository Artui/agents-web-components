import type { AgUiChat } from "../core/ag_ui_chat.js";

/** What `registerA2ui` needs of the chat element: an `<ag-ui-chat>` has all of it. */
export type A2uiHost = Pick<AgUiChat, "registerActivityRenderer" | "registerContext" | "run">;
