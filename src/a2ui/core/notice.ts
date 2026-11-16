/** A line drawn where something on a surface cannot be: an `a2ui-notice` part. */
export function notice(text: string): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("part", "a2ui-notice");
  element.setAttribute("role", "note");
  element.textContent = text;
  return element;
}
