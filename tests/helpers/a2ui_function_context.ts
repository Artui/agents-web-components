import type { FunctionContext } from "../../src/a2ui/core/function_context.js";
import { BASIC_FUNCTIONS } from "../../src/a2ui/functions/basic_functions.js";

/** A function context over a flat path table, calling the basic functions. */
export function functionContext(
  data: Record<string, unknown> = {},
  userActivation = false,
): FunctionContext {
  const context: FunctionContext = {
    read: (path) => data[path],
    call: (name, args) => {
      const fn = BASIC_FUNCTIONS[name];
      if (!fn) {
        throw new Error(`no function ${name}`);
      }
      return fn(args, context);
    },
    userActivation,
  };
  return context;
}

/** Call basic function `name` with `args`. */
export function callBasic(
  name: string,
  args: Record<string, unknown>,
  data: Record<string, unknown> = {},
  userActivation = false,
): unknown {
  return (BASIC_FUNCTIONS[name] as NonNullable<(typeof BASIC_FUNCTIONS)[string]>)(
    args,
    functionContext(data, userActivation),
  );
}
