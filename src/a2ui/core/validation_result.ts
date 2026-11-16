/**
 * The outcome of one check, A2UI 1.0's `ValidationResult`. A validation
 * function returns it; {@link toValidationResult} makes one from anything a
 * check's condition evaluates to.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly code?: string;
  readonly message?: string;
  readonly severity?: "error" | "warning" | "info";
}
