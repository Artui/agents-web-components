import type { ComponentRenderer } from "../core/component_renderer.js";

const VARIANTS: readonly unknown[] = ["default", "primary", "borderless"];

/**
 * The basic catalog's `Button`: its child inside a native button that runs
 * `action` through the surface on a click. Any failing `@checks` rule disables
 * it at once, as the spec says, and its message shows under the button so the
 * user can see why.
 */
export const button: ComponentRenderer = (component, scope) => {
  const root = document.createElement("div");
  root.dataset["variant"] = VARIANTS.includes(component["variant"])
    ? String(component["variant"])
    : "default";
  const control = document.createElement("button");
  control.setAttribute("part", "a2ui-button-control");
  control.setAttribute("data-a2ui-control", "");
  control.type = "button";
  control.disabled = !scope.live;
  control.append(scope.child(component["child"]));

  const message = document.createElement("div");
  message.setAttribute("part", "a2ui-button-message");
  message.id = scope.nextId("a2ui-check");
  message.hidden = true;
  root.append(control, message);

  scope.checks(component, (failures) => {
    control.disabled = !scope.live || failures.length > 0;
    message.textContent = failures
      .map((failure) => failure.message)
      .filter((text) => text !== "")
      .join("\n");
    message.hidden = message.textContent === "";
    if (message.hidden) {
      control.removeAttribute("aria-describedby");
    } else {
      control.setAttribute("aria-describedby", message.id);
    }
  });
  control.addEventListener("click", () => scope.act(component["action"], component));
  return root;
};
