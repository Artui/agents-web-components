import { fillUiString } from "../ui/fill_ui_string.js";
import type { UiStrings } from "../ui/ui_strings.js";

/** What a live view asks the user to allow: a message sent as theirs, or a tool run. */
export type McpAppConsentRequest =
  | { readonly method: "ui/message"; readonly text: string }
  | {
      readonly method: "tools/call";
      readonly name: string;
      readonly arguments: Readonly<Record<string, unknown>>;
    };

/** What asks the user, beside one view, whether it may act: see {@link viewConsent}. */
export interface McpAppViewConsent {
  /** Resolves `true` once the user allows `request`, `false` once they decline or the view goes. */
  ask(request: McpAppConsentRequest): Promise<boolean>;
  /** Declines every request still waiting and removes its card: the view is going. */
  dispose(): void;
}

interface Pending {
  readonly request: McpAppConsentRequest;
  readonly resolve: (allowed: boolean) => void;
}

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.className = className;
  control.textContent = label;
  control.addEventListener("click", onClick);
  return control;
}

function card(
  request: McpAppConsentRequest,
  strings: UiStrings,
  answer: (allowed: boolean) => void,
): HTMLElement {
  const node = document.createElement("div");
  node.className = "confirm mcp-app-consent";
  node.setAttribute("part", "confirm mcp-app-consent");
  node.setAttribute("role", "group");
  node.setAttribute("aria-label", strings.confirmAction);
  node.dataset["mcpAppRequest"] = request.method;
  const body = document.createElement("div");
  body.className = "confirm-body";
  body.setAttribute("part", "confirm-body");
  const detail = document.createElement("pre");
  detail.className = "confirm-args";
  detail.setAttribute("part", "confirm-args");
  if (request.method === "ui/message") {
    body.textContent = strings.mcpAppConfirmMessage;
    detail.textContent = request.text;
  } else {
    body.textContent = fillUiString(strings.mcpAppConfirmTool, { tool: request.name });
    detail.textContent = JSON.stringify(request.arguments, null, 2);
    detail.hidden = Object.keys(request.arguments).length === 0;
  }
  const actions = document.createElement("div");
  actions.className = "confirm-actions";
  actions.setAttribute("part", "confirm-actions");
  const cancel = button("confirm-btn confirm-btn--cancel", strings.cancel, () => answer(false));
  cancel.setAttribute("part", "confirm-button confirm-cancel");
  const confirm = button("confirm-btn confirm-btn--confirm", strings.confirm, () => answer(true));
  confirm.setAttribute("part", "confirm-button confirm-confirm");
  actions.append(cancel, confirm);
  node.append(body, detail, actions);
  return node;
}

/**
 * Asks the user, in a confirmation card appended to `stage` (the box that holds
 * the view's frame, so it shows inline and fullscreen alike), whether the view
 * may act. One card at a time, in the order the view asked; nothing is focused,
 * so a keystroke meant for the composer cannot answer it.
 */
export function viewConsent(stage: HTMLElement, strings: () => UiStrings): McpAppViewConsent {
  const queue: Pending[] = [];
  let shown: HTMLElement | null = null;
  let disposed = false;

  const next = (): void => {
    const head = queue[0];
    if (head === undefined) {
      return;
    }
    const node = card(head.request, strings(), (allowed) => {
      if (shown !== node) {
        return;
      }
      node.remove();
      shown = null;
      queue.shift();
      head.resolve(allowed);
      next();
    });
    shown = node;
    stage.append(node);
  };

  return {
    ask(request) {
      return new Promise((resolve) => {
        if (disposed) {
          resolve(false);
          return;
        }
        queue.push({ request, resolve });
        if (shown === null) {
          next();
        }
      });
    },
    dispose() {
      disposed = true;
      shown?.remove();
      shown = null;
      for (const pending of queue.splice(0)) {
        pending.resolve(false);
      }
    },
  };
}
