import type { ThreadMeta, ThreadParent } from "../../core/conversation_store.js";
import { fillUiString } from "../fill_ui_string.js";
import type { UiStrings } from "../ui_strings.js";

/**
 * The way back from a child session to the conversation that started it: one
 * line between the header and the transcript, shown while the thread on
 * screen is a child.
 *
 * Read off the thread list the chat already holds, so it shows once a list
 * naming the active thread's parent has arrived, and names the parent by its
 * title when the list holds it too. A parent the list does not hold is still
 * reachable, under a fallback name. Titles are set as text, never markup.
 */
export class ParentBreadcrumb {
  /** The line's root; the host places it in the chat column. Hidden while there is no parent. */
  readonly element: HTMLDivElement;
  readonly #button: HTMLButtonElement;
  #parent: ThreadParent | null = null;

  constructor(onOpen: (parent: ThreadParent) => void) {
    this.element = document.createElement("div");
    this.element.className = "parent-breadcrumb";
    this.element.setAttribute("part", "parent-breadcrumb");
    this.element.hidden = true;
    this.#button = document.createElement("button");
    this.#button.type = "button";
    this.#button.className = "parent-breadcrumb-link";
    this.#button.setAttribute("part", "parent-breadcrumb-link");
    this.#button.addEventListener("click", () => {
      if (this.#parent !== null) {
        onOpen(this.#parent);
      }
    });
    this.element.append(this.#button);
  }

  /** Show the parent of `activeId` as `threads` names it, or hide when it names none. */
  show(threads: readonly ThreadMeta[], activeId: string, strings: UiStrings): void {
    const parent = threads.find((meta) => meta.threadId === activeId)?.parent ?? null;
    this.#parent = parent;
    this.element.hidden = parent === null;
    if (parent === null) {
      this.#button.textContent = "";
      return;
    }
    const title = threads.find((meta) => meta.threadId === parent.threadId)?.title;
    this.#button.textContent =
      title === undefined
        ? strings.parentThreadUnlisted
        : fillUiString(strings.parentThread, { title });
  }
}
