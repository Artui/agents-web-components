import type { UiStrings } from "../ui_strings.js";

/** The line naming the model under an answer a fallback model gave, or `null` for any other. */
export function renderAnsweredByModel(
  metadata: unknown,
  strings: Pick<UiStrings, "answeredByModel">,
): HTMLElement | null {
  const marks = Object(metadata) as { model_id?: unknown; model_fallback?: unknown };
  if (
    marks.model_fallback !== true ||
    typeof marks.model_id !== "string" ||
    marks.model_id === ""
  ) {
    return null;
  }
  const line = document.createElement("p");
  line.className = "answered-by-model";
  line.setAttribute("part", "answered-by-model");
  line.textContent = strings.answeredByModel.replace("{model}", marks.model_id);
  return line;
}
