import { renderMarkdown } from "../../ui/transcript/render_markdown.js";
import type { ComponentRenderer } from "../core/component_renderer.js";
import { choice } from "./utils.js";

/**
 * Text: its `text` as markdown, through the transcript's sanitiser, so an
 * agent's HTML never reaches the DOM unsanitised and no image loads.
 */
export const renderText: ComponentRenderer = (component, scope) => {
  const element = document.createElement("div");
  element.dataset["variant"] = choice(component["variant"], ["body", "caption"], "body");
  scope.watch(component["text"], (value) => {
    element.innerHTML = renderMarkdown(textOf(value));
  });
  return element;
};

function textOf(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}
