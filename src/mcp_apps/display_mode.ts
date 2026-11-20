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
 * shadow sheet sizes to the viewport, and shows it as a manual popover, so it
 * is in the top layer above the host's stacking context and any containing
 * ancestor; a top-layer element is not moved in the tree, so the frame stays.
 * Without popover support it is a fixed box within the host's stacking context.
 * It shows the stage's close control, focuses it, and keeps the node's height.
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
  let popped = false;
  const doc = node.ownerDocument;

  const inline = (): void => {
    mode = "inline";
    delete stage.dataset["displayMode"];
    if (popped) {
      popped = false;
      stage.hidePopover();
      stage.removeAttribute("popover");
    }
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
        if (typeof stage.showPopover === "function") {
          stage.popover = "manual";
          stage.showPopover();
          popped = true;
        }
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
