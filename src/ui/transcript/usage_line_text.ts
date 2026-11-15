import { fillUiString } from "../fill_ui_string.js";
import type { UiStrings } from "../ui_strings.js";

/** A turn's token totals, `null` for a side the server never sent. */
export interface UsageTotals {
  readonly input: number | null;
  readonly output: number | null;
}

/** The usage line's text for `usage`, or `null` when neither side was sent. */
export function usageLineText(strings: UiStrings, usage: UsageTotals): string | null {
  const { input, output } = usage;
  if (input !== null && output !== null) {
    return fillUiString(strings.usageBoth, { input: grouped(input), output: grouped(output) });
  }
  if (input !== null) {
    return fillUiString(strings.usageInput, { input: grouped(input) });
  }
  if (output !== null) {
    return fillUiString(strings.usageOutput, { output: grouped(output) });
  }
  return null;
}

/** `count` with commas between thousands, locale-neutral as every built-in string here is. */
function grouped(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
