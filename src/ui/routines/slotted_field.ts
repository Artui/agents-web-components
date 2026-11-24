/** A named slot a host can plug its own control into, with the default as fallback. */
export interface SlottedField {
  readonly slot: HTMLSlotElement;
  /** The plugged control's value, or the default's when nothing is plugged. */
  value(): string;
  /** Write the routine's value into any control not yet written: plugged, or slotted on `host`. */
  bind(host?: Element): void;
}

/**
 * A `<slot name>` holding `fallback`, whose plugged control receives `initial`.
 *
 * The contract is the theme slot's: any element with a string `value`. Each
 * control is written once per form, so a host re-rendering its control (a
 * slotchange) does not overwrite what the user is choosing.
 */
export function slottedField(
  name: string,
  initial: string,
  fallback: readonly Node[],
  read: () => string,
): SlottedField {
  const slot = document.createElement("slot");
  slot.name = name;
  slot.append(...fallback);
  const written = new WeakSet<Element>();
  const bind = (host?: Element): void => {
    const controls =
      host === undefined
        ? slot.assignedElements()
        : [...host.children].filter((child) => child.getAttribute("slot") === name);
    for (const control of controls) {
      if (!written.has(control)) {
        written.add(control);
        (control as unknown as { value: string }).value = initial;
      }
    }
  };
  slot.addEventListener("slotchange", () => bind());
  return {
    slot,
    bind,
    value: () => {
      const [control] = slot.assignedElements();
      return control === undefined
        ? read()
        : String((control as unknown as { value: unknown }).value);
    },
  };
}
