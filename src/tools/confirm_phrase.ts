import type { Interrupt } from "@ag-ui/core";
import { X_CONFIRM_KEY } from "../constants.js";

/**
 * A server-authored question for a gated call, read off the interrupt's metadata under
 * `x-confirm`, as a client-side confirmation reads it from the schema. Narrowed because
 * `metadata` is untyped on the wire and a non-string would render as "[object Object]".
 * The approval card and the inbox row both word an approval by it.
 */
export function confirmPhrase(interrupt: Interrupt): string | undefined {
  const phrase = interrupt.metadata?.[X_CONFIRM_KEY];
  return typeof phrase === "string" && phrase.trim() !== "" ? phrase : undefined;
}
