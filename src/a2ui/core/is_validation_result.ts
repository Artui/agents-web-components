import type { ValidationResult } from "./validation_result.js";

/** Whether `value` is a {@link ValidationResult}: an object with a boolean `valid`. */
export function isValidationResult(value: unknown): value is ValidationResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { valid?: unknown }).valid === "boolean"
  );
}
