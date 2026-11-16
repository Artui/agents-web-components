import type { A2uiComponent } from "../core/a2ui_component.js";
import type { CheckFailure } from "../core/check_failure.js";
import type { SurfaceScope } from "../core/surface_scope.js";

/** A resolved `DynamicString` as text: nothing for `null` or a missing value. */
export function asText(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

/**
 * Show the component's failing `@checks` in `message` and mark `control`
 * invalid while an error fails. Nothing shows until the returned `touch` is
 * called, at the user's first edit or departure, so an empty form opens quiet.
 */
export function bindChecks(
  component: A2uiComponent,
  scope: SurfaceScope,
  message: HTMLElement,
  control: Element,
): () => void {
  message.id = scope.nextId("a2ui-check");
  message.hidden = true;
  let failures: readonly CheckFailure[] = [];
  let touched = false;
  const render = (): void => {
    const shown = touched ? failures : [];
    message.textContent = shown
      .map((failure) => failure.message)
      .filter((text) => text !== "")
      .join("\n");
    message.hidden = message.textContent === "";
    const first = shown[0];
    if (first === undefined) {
      delete message.dataset["severity"];
      control.removeAttribute("aria-invalid");
      control.removeAttribute("aria-describedby");
      return;
    }
    const error = shown.some((failure) => failure.severity === "error");
    message.dataset["severity"] = error ? "error" : first.severity;
    control.setAttribute("aria-describedby", message.id);
    if (error) {
      control.setAttribute("aria-invalid", "true");
    } else {
      control.removeAttribute("aria-invalid");
    }
  };
  scope.checks(component, (next) => {
    failures = next;
    render();
  });
  return () => {
    if (!touched) {
      touched = true;
      render();
    }
  };
}
