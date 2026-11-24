import type { UiStrings } from "../ui_strings.js";

/** The minute step when the host names none (or one out of range). */
const DEFAULT_STEP = 5;

/** The routine's time as an hour and a minute select, one labelled group. */
export interface TimeField {
  readonly element: HTMLDivElement;
  /** The time the selects hold, `HH:MM` on a 24-hour clock. */
  value(): string;
  /** Redraw the minutes in steps of `raw` (a whole number from 1 to 30); anything else is ignored. */
  useStep(raw: string | null): void;
}

/**
 * Build the time pair over `at` (`HH:MM`), named by the element whose id is `labelledBy`.
 *
 * Two selects rather than a native time input, so the drop-down is drawn by
 * the panel's tokens and not by the browser. A minute off the step (a routine
 * saved elsewhere at 08:07) is kept as an option of its own, never rounded.
 */
export function buildTimeField(
  at: string,
  labelledBy: string,
  strings: Pick<UiStrings, "routineHour" | "routineMinute">,
): TimeField {
  const [hh = "", mm = ""] = at.split(":");
  const group = document.createElement("div");
  group.className = "routine-time";
  group.setAttribute("part", "routine-time");
  group.setAttribute("role", "group");
  group.setAttribute("aria-labelledby", labelledBy);
  const hour = select("hour", strings.routineHour);
  const minute = select("minute", strings.routineMinute);
  fill(hour, 1, 24, hh);
  fill(minute, DEFAULT_STEP, 60, mm);
  const colon = document.createElement("span");
  colon.className = "routine-time-colon";
  colon.setAttribute("aria-hidden", "true");
  colon.textContent = ":";
  group.append(hour, colon, minute);
  return {
    element: group,
    value: () => `${hour.value}:${minute.value}`,
    useStep: (raw) => {
      const step = Number(raw);
      if (Number.isInteger(step) && step >= 1 && step <= 30) {
        fill(minute, step, 60, minute.value);
      }
    },
  };
}

function select(unit: string, label: string): HTMLSelectElement {
  const control = document.createElement("select");
  control.id = `routine-field-at-${unit}`;
  control.setAttribute("aria-label", label);
  return control;
}

/** Offer 0 to `end` in steps of `step`, two digits each, plus `held` if it is off the step. */
function fill(control: HTMLSelectElement, step: number, end: number, held: string): void {
  const values: string[] = [];
  for (let n = 0; n < end; n += step) {
    values.push(String(n).padStart(2, "0"));
  }
  if (!values.includes(held)) {
    values.push(held);
    values.sort();
  }
  control.replaceChildren(...values.map((value) => option(value)));
  control.value = held;
}

function option(value: string): HTMLOptionElement {
  const choice = document.createElement("option");
  choice.value = value;
  choice.textContent = value;
  return choice;
}
