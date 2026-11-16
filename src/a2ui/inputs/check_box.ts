import type { ComponentRenderer } from "../core/component_renderer.js";
import { toBoolean } from "../core/to_boolean.js";
import { asText, bindChecks } from "./utils.js";

/** The basic catalog's `CheckBox`: a labelled checkbox bound both ways to a `DynamicBoolean`. */
export const checkBox: ComponentRenderer = (component, scope) => {
  const root = document.createElement("div");
  const label = document.createElement("label");
  label.setAttribute("part", "a2ui-check-box-label");
  const control = document.createElement("input");
  control.setAttribute("part", "a2ui-check-box-input");
  control.type = "checkbox";
  control.disabled = !scope.live;
  const text = document.createElement("span");
  text.setAttribute("part", "a2ui-check-box-text");
  label.append(control, text);

  const message = document.createElement("div");
  message.setAttribute("part", "a2ui-check-box-message");
  root.append(label, message);

  scope.watch(component["label"], (value) => {
    text.textContent = asText(value);
  });
  scope.watch(component["value"], (value) => {
    control.checked = toBoolean(value);
  });

  const touch = bindChecks(component, scope, message, control);
  control.addEventListener("change", () => {
    scope.write(component["value"], control.checked);
    touch();
  });
  return root;
};
