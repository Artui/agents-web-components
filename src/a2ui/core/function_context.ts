/** What an {@link A2uiFunction} can reach besides its args. */
export interface FunctionContext {
  /** The data model value at a path, relative paths read from the scope's base. */
  read(path: string): unknown;
  /**
   * Call another function by name, `@index` included, with these args
   * (resolved first, as a call's always are). How `formatString` evaluates a
   * `${fn(...)}` expression.
   */
  call(name: string, args: Readonly<Record<string, unknown>>): unknown;
  /**
   * `true` only while an action runs from a user gesture. A function the
   * catalog marks `requiresUserActivation` (`openUrl`) must do nothing
   * without it.
   */
  readonly userActivation: boolean;
}
