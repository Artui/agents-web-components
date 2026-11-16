import type { ComponentRenderer } from "../core/component_renderer.js";
import { asText, bindChecks, nextId } from "./utils.js";

const VARIANTS: readonly unknown[] = ["shortText", "longText", "number", "obscured"];

/**
 * The basic catalog's `TextField`: a labelled input, or a textarea for
 * `longText`, bound both ways to `value`. A model change sets the control only
 * when its text differs, so the caret and focus of a user typing survive it.
 * `number` stays a text input with a decimal keyboard: the value is a
 * `DynamicString`, and a number input reads a half-typed `-` as empty.
 */
export const textField: ComponentRenderer = (component, scope) => {
  const variant = VARIANTS.includes(component["variant"])
    ? String(component["variant"])
    : "shortText";
  const root = document.createElement("div");
  root.dataset["variant"] = variant;

  const label = document.createElement("label");
  label.setAttribute("part", "a2ui-text-field-label");
  const control =
    variant === "longText" ? document.createElement("textarea") : document.createElement("input");
  control.setAttribute("part", "a2ui-text-field-input");
  control.setAttribute("data-a2ui-control", "");
  if (control instanceof HTMLInputElement) {
    control.type = variant === "obscured" ? "password" : "text";
    if (variant === "number") {
      control.inputMode = "decimal";
    }
  }
  control.id = nextId("a2ui-text-field");
  label.htmlFor = control.id;
  control.disabled = !scope.live;

  const message = document.createElement("div");
  message.setAttribute("part", "a2ui-text-field-message");
  root.append(label, control, message);

  scope.watch(component["label"], (value) => {
    label.textContent = asText(value);
    label.hidden = label.textContent === "";
  });
  if (component["placeholder"] !== undefined) {
    scope.watch(component["placeholder"], (value) => {
      control.placeholder = asText(value);
    });
  }
  scope.watch(component["value"], (value) => {
    const text = asText(value);
    if (control.value !== text) {
      control.value = text;
    }
  });

  const touch = bindChecks(component, scope, message, control);
  control.addEventListener("input", () => {
    scope.write(component["value"], control.value);
    touch();
  });
  control.addEventListener("blur", touch);
  return root;
};
