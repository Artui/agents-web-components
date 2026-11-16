import type { ComponentRenderer } from "../core/component_renderer.js";
import { asText, bindChecks, nextId } from "./utils.js";

interface Choice {
  readonly option: HTMLLabelElement;
  readonly input: HTMLInputElement;
  readonly text: HTMLSpanElement;
}

/**
 * The basic catalog's `ChoicePicker`: radios for `mutuallyExclusive`, checkboxes
 * for `multipleSelection`, drawn as a list or as chips, bound both ways to a
 * `DynamicStringList`. `filterable` adds a search box that hides the options
 * whose label does not contain its text.
 */
export const choicePicker: ComponentRenderer = (component, scope) => {
  const exclusive = component["variant"] !== "multipleSelection";
  const root = document.createElement("fieldset");
  root.dataset["variant"] = exclusive ? "mutuallyExclusive" : "multipleSelection";
  root.dataset["display"] = component["displayStyle"] === "chips" ? "chips" : "checkbox";
  root.disabled = !scope.live;

  const legend = document.createElement("legend");
  legend.setAttribute("part", "a2ui-choice-picker-label");
  root.append(legend);

  const filter = component["filterable"] === true ? document.createElement("input") : null;
  if (filter !== null) {
    filter.setAttribute("part", "a2ui-choice-picker-filter");
    filter.type = "search";
    filter.disabled = !scope.live;
    root.append(filter);
  }

  const list = document.createElement("div");
  list.setAttribute("part", "a2ui-choice-picker-options");
  const message = document.createElement("div");
  message.setAttribute("part", "a2ui-choice-picker-message");
  root.append(list, message);

  const name = nextId("a2ui-choice");
  const choices: Choice[] = [];
  const refilter = (): void => {
    const query = filter === null ? "" : filter.value.trim().toLowerCase();
    for (const { option, text } of choices) {
      option.hidden = query !== "" && !asText(text.textContent).toLowerCase().includes(query);
    }
  };
  const mark = (): void => {
    for (const { option, input } of choices) {
      option.toggleAttribute("data-selected", input.checked);
    }
  };

  const touch = bindChecks(component, scope, message, root);
  const options: readonly unknown[] = Array.isArray(component["options"])
    ? component["options"]
    : [];
  for (const entry of options) {
    const record = (typeof entry === "object" && entry !== null ? entry : {}) as Readonly<
      Record<string, unknown>
    >;
    const value = record["value"];
    if (typeof value !== "string") {
      continue;
    }
    const option = document.createElement("label");
    option.setAttribute("part", "a2ui-choice-picker-option");
    const input = document.createElement("input");
    input.setAttribute("part", "a2ui-choice-picker-input");
    input.type = exclusive ? "radio" : "checkbox";
    input.name = name;
    input.value = value;
    input.disabled = !scope.live;
    const text = document.createElement("span");
    text.setAttribute("part", "a2ui-choice-picker-option-text");
    option.append(input, text);
    list.append(option);
    choices.push({ option, input, text });

    scope.watch(record["label"], (value) => {
      text.textContent = asText(value);
      refilter();
    });
    input.addEventListener("change", () => {
      mark();
      scope.write(
        component["value"],
        choices.filter((choice) => choice.input.checked).map((choice) => choice.input.value),
      );
      touch();
    });
  }

  scope.watch(component["label"], (value) => {
    legend.textContent = asText(value);
    legend.hidden = legend.textContent === "";
    filter?.setAttribute("aria-label", legend.textContent);
  });
  scope.watch(component["value"], (value) => {
    const selected = Array.isArray(value) ? value : [];
    for (const { input } of choices) {
      input.checked = selected.includes(input.value);
    }
    mark();
  });
  filter?.addEventListener("input", refilter);
  return root;
};
