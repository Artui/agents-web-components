/** Dispatch the `input` then `change` events frameworks listen for. */
export function dispatchInputAndChange(el: HTMLElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
