import { isValidationResult } from "./is_validation_result.js";
import { toBoolean } from "./to_boolean.js";
import type { ValidationResult } from "./validation_result.js";

/** A {@link ValidationResult} that failed, its severity always set. */
export type FailedValidation = ValidationResult & {
  readonly valid: false;
  readonly severity: NonNullable<ValidationResult["severity"]>;
};

/**
 * What a check's `condition` evaluated to, as a {@link ValidationResult}: a
 * failing result takes the rule's `message` when it has none of its own, and
 * `severity` defaults to `"error"`; any other value is coerced by
 * {@link toBoolean}, `false` failing with the rule's message.
 */
export function toValidationResult(
  value: unknown,
  message?: string,
): { readonly valid: true } | FailedValidation {
  const result = isValidationResult(value) ? value : { valid: toBoolean(value) };
  if (result.valid) {
    return { valid: true };
  }
  const text = result.message ?? message;
  return {
    ...result,
    valid: false,
    severity: result.severity ?? "error",
    ...(text === undefined ? {} : { message: text }),
  };
}
