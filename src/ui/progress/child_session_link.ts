import type { ThreadStatus } from "../../core/conversation_store.js";
import { fillUiString } from "../fill_ui_string.js";
import type { UiStrings } from "../ui_strings.js";
import type { ChildSessionReceipt } from "./child_session_receipt.js";

/**
 * The link from a `start_session` card to the child session it started.
 *
 * Hung in the card's sub-agent slot, where an inline delegation draws its
 * panel, so a delegation reads the same whichever way it ran. A child that
 * is parked on a person reads "needs you", and the link still only navigates:
 * the child's approval belongs to the child's thread, where its card can say
 * what it approves, so the parent never draws a control that answers it.
 *
 * Its own class and part, never the panel's: the tool step group reads a
 * running delegation off `.subagent` and must not mistake a link for one.
 */
export class ChildSessionLink {
  readonly element: HTMLButtonElement;
  readonly receipt: ChildSessionReceipt;

  constructor(receipt: ChildSessionReceipt, onOpen: (receipt: ChildSessionReceipt) => void) {
    this.receipt = receipt;
    this.element = document.createElement("button");
    this.element.type = "button";
    this.element.className = "child-session-link";
    this.element.setAttribute("part", "child-session-link");
    this.element.setAttribute("data-thread-id", receipt.threadId);
    this.element.setAttribute("data-agent-id", receipt.agentId);
    this.element.addEventListener("click", () => onOpen(this.receipt));
  }

  /**
   * Word the link for the child's run as the listed row reports it, `null`
   * when the list holds no row for it. Server text is set as text, never markup.
   */
  update(strings: UiStrings, status: ThreadStatus | null): void {
    const waiting = status === "waiting";
    if (status === null) {
      this.element.removeAttribute("data-status");
    } else {
      this.element.setAttribute("data-status", status);
    }
    this.element.textContent = fillUiString(
      waiting ? strings.childSessionNeedsYou : strings.childSessionOpen,
      { agent: this.receipt.agentId },
    );
  }
}
