/** One failing check of a component, as {@link SurfaceScope.checks} reports it. */
export interface CheckFailure {
  readonly message: string;
  readonly severity: "error" | "warning" | "info";
  readonly code?: string;
}
