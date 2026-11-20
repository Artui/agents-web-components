import { ICON_BACK } from "../../constants.js";
import { headerButton } from "./header_button.js";

/** One screen of a {@link PanelView}: its bar, its body and its footer. */
export interface PanelScreen {
  readonly title: string;
  /** A short line beside the title (a count, a `/token`). */
  readonly sub?: string;
  /** Controls at the end of the bar, after the title. */
  readonly actions?: readonly HTMLElement[];
  readonly body: readonly Node[];
  readonly footer?: readonly Node[];
}

/**
 * A full-panel view below the chat's header, in place of the transcript and
 * the composer: a bar with a back arrow, a scrolling body and a footer.
 *
 * Generic on purpose: it knows nothing of what it shows. The element hides the
 * transcript while it is open rather than detaching it, so live views in the
 * conversation (an MCP App's iframe) are not reloaded by a visit here.
 */
export class PanelView {
  readonly element: HTMLDivElement;
  readonly #back: HTMLButtonElement;
  readonly #title: HTMLHeadingElement;
  readonly #sub: HTMLSpanElement;
  readonly #actions: HTMLDivElement;
  readonly #body: HTMLDivElement;
  readonly #footer: HTMLDivElement;
  readonly #status: HTMLDivElement;
  readonly #backLabel: () => string;

  /** `backLabel` is read on each {@link show}, so a later strings override reaches it. */
  constructor(backLabel: () => string, onBack: () => void) {
    this.#backLabel = backLabel;
    this.element = document.createElement("div");
    this.element.className = "panel-view";
    this.element.setAttribute("part", "panel-view");
    this.element.setAttribute("role", "region");
    this.element.hidden = true;

    const bar = document.createElement("div");
    bar.className = "panel-view-bar";
    bar.setAttribute("part", "panel-view-bar");
    this.#back = headerButton("back", backLabel(), ICON_BACK);
    this.#back.addEventListener("click", onBack);
    const heading = document.createElement("div");
    heading.className = "panel-view-heading";
    this.#title = document.createElement("h2");
    this.#title.className = "panel-view-title";
    this.#title.setAttribute("part", "panel-view-title");
    this.#sub = document.createElement("span");
    this.#sub.className = "panel-view-sub";
    heading.append(this.#title, this.#sub);
    this.#actions = document.createElement("div");
    this.#actions.className = "panel-view-actions";
    bar.append(this.#back, heading, this.#actions);

    this.#body = document.createElement("div");
    this.#body.className = "panel-view-body";
    this.#body.setAttribute("part", "panel-view-body");
    this.#footer = document.createElement("div");
    this.#footer.className = "panel-view-footer";
    this.#footer.setAttribute("part", "panel-view-footer");
    this.#status = document.createElement("div");
    this.#status.className = "panel-view-status";
    this.#status.setAttribute("role", "status");
    this.element.append(bar, this.#body, this.#footer, this.#status);

    this.element.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onBack();
      }
    });
  }

  /** Whether the view is showing. */
  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** Show `screen`, replacing whatever the view held, and put focus on its back arrow. */
  show(screen: PanelScreen): void {
    const back = this.#backLabel();
    this.#back.title = back;
    this.#back.setAttribute("aria-label", back);
    this.#title.textContent = screen.title;
    this.#sub.textContent = screen.sub ?? "";
    this.#sub.hidden = screen.sub === undefined;
    this.#actions.replaceChildren(...(screen.actions ?? []));
    this.#body.replaceChildren(...screen.body);
    this.#body.scrollTop = 0;
    this.#footer.replaceChildren(...(screen.footer ?? []));
    this.#footer.hidden = screen.footer === undefined || screen.footer.length === 0;
    this.element.setAttribute("aria-label", screen.title);
    this.#status.textContent = "";
    this.element.hidden = false;
    this.#back.focus();
  }

  /** Say `text` in the view's status line (read out, and shown until the next screen). */
  announce(text: string): void {
    this.#status.textContent = text;
  }

  /** Hide the view and drop what it showed, its status line included. */
  close(): void {
    this.element.hidden = true;
    this.#actions.replaceChildren();
    this.#body.replaceChildren();
    this.#footer.replaceChildren();
    this.#status.textContent = "";
  }
}
