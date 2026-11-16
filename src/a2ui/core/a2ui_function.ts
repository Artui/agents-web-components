import type { FunctionContext } from "./function_context.js";

/**
 * One catalog function. `args` arrive resolved: every `{"@path"}` read and
 * every nested `{"@call"}` evaluated, arrays and plain objects member by
 * member. A `DynamicBoolean` arg is not yet coerced: pass it to `toBoolean`.
 *
 * Synchronous and pure but for `openUrl`. Throw on args it cannot use: the
 * core turns a throw into `null` for a binding, a failed check for a
 * condition, and an `error` for an action.
 */
export type A2uiFunction = (
  args: Readonly<Record<string, unknown>>,
  context: FunctionContext,
) => unknown;
