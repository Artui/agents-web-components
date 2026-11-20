import type { McpAppDisplayMode, McpAppsOverlay } from "./types.js";

/** How one view is shown, and what switches it: see {@link displayMode}. */
export interface McpAppViewDisplay {
  /** The mode the view is shown in now. */
  readonly mode: McpAppDisplayMode;
  /** Shows the view in `requested` when it is a mode this host shows; returns the mode it is in. */
  request(requested: unknown): McpAppDisplayMode;
  /** Calls `listener` after each switch the user makes (Escape, the close control). */
  onUserSwitch(listener: () => void): void;
  /** Returns the view inline without telling the listener: the view is going. */
  dispose(): void;
}

/**
 * Switches a view between `inline` and `fullscreen` by restyling `stage`, the
 * box that holds its frame, never by moving the frame, which would reload it.
 * Fullscreen stamps `data-display-mode="fullscreen"` on the stage, which the
 * shadow sheet fixes over the viewport (or over the box of an ancestor that
 * contains fixed descendants, such as the sidebar host), shows the stage's
 * close control and focuses it, and keeps the node's height in the transcript.
 * Escape anywhere in the document, or the close control, returns it inline.
 * `overlay` holds the one view of the registration shown fullscreen, so a
 * second view's request returns the first inline before it opens.
 */
export function displayMode(
  node: HTMLElement,
  stage: HTMLElement,
  close: HTMLButtonElement,
  overlay: McpAppsOverlay,
): McpAppViewDisplay {
  let mode: McpAppDisplayMode = "inline";
  let listener: () => void = () => undefined;
  const doc = node.ownerDocument;

  const inline = (): void => {
    mode = "inline";
    delete stage.dataset["displayMode"];
    close.hidden = true;
    node.style.minHeight = "";
    doc.removeEventListener("keydown", onKey, true);
    if (overlay.exit === byUser) {
      overlay.exit = null;
    }
  };
  const byUser = (): void => {
    inline();
    listener();
  };
  // In the capture phase, ahead of the chat's own Escape, which would also collapse it.
  function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      byUser();
    }
  }
  close.addEventListener("click", byUser);

  return {
    get mode() {
      return mode;
    },
    request(requested) {
      if (requested === "inline" && mode === "fullscreen") {
        inline();
      } else if (requested === "fullscreen" && mode === "inline") {
        overlay.exit?.();
        node.style.minHeight = `${node.offsetHeight}px`;
        mode = "fullscreen";
        stage.dataset["displayMode"] = "fullscreen";
        close.hidden = false;
        overlay.exit = byUser;
        doc.addEventListener("keydown", onKey, true);
        close.focus();
      }
      return mode;
    },
    onUserSwitch(next) {
      listener = next;
    },
    dispose() {
      if (mode === "fullscreen") {
        inline();
      }
    },
  };
}
