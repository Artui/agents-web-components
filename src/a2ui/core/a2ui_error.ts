/** The body of A2UI 1.0's renderer-to-agent `error` message, for one surface. */
export interface A2uiError {
  readonly code: string;
  readonly surfaceId: string;
  readonly message: string;
  /** The JSON Pointer of the field at fault, for `VALIDATION_FAILED`. */
  readonly path?: string;
}
