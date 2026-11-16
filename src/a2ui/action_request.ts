import type { AgUiRunRequest } from "../core/agui_client.js";
import type { UserAction } from "./core/user_action.js";
import { sha256Hex } from "./sha256_hex.js";

/**
 * The run that sends `action` to the agent under `runId`, with the user turn
 * the server builds from it.
 *
 * The turn's id and text are django-ag-ui's `with_a2ui_action`, so the bubble
 * drawn now is the one the server stores: `a2ui-action-user-<sha256(runId)>`,
 * and a non-empty `userMessage` and a blank line before the action as compact
 * JSON.
 */
export function actionRequest(action: UserAction, runId: string): AgUiRunRequest {
  const block = `A2UI user action:\n${JSON.stringify(action)}`;
  return {
    forwardedProps: { a2uiAction: { userAction: action } },
    runId,
    message: {
      id: `a2ui-action-user-${sha256Hex(runId)}`,
      content: action.userMessage === undefined ? block : `${action.userMessage}\n\n${block}`,
    },
  };
}
