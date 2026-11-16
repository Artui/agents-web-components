import { isValidationResult } from "./is_validation_result.js";

/**
 * A resolved `DynamicBoolean`, coerced by the A2UI 1.0 table: a boolean as is,
 * a `ValidationResult` to its `valid`, the strings `"true"` and `"false"` in
 * any case to their value and every other string to `false`, `0` to `false`
 * and every other number to `true`, and anything else to `false`.
 */
export function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (isValidationResult(value)) {
    return value.valid;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return false;
}
