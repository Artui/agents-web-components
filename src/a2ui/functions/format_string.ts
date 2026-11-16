import type { A2uiFunction } from "../core/a2ui_function.js";
import type { FunctionContext } from "../core/function_context.js";
import { stringArg } from "./utils.js";

const QUOTED = /^(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/;
const CALL = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(/;

function text(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** The index just past the `}` that closes the `${` whose body starts at `start`. */
function closeOf(source: string, start: number): number {
  let depth = 1;
  let quote = "";
  for (let i = start; i < source.length; i++) {
    const char = source.charAt(i);
    if (quote !== "") {
      if (char === "\\") {
        i++;
      } else if (char === quote) {
        quote = "";
      }
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "{") {
      depth++;
    } else if (char === "}" && --depth === 0) {
      return i + 1;
    }
  }
  throw new SyntaxError("unterminated ${ in formatString");
}

class Expression {
  private at = 0;

  constructor(
    private readonly source: string,
    private readonly context: FunctionContext,
  ) {}

  evaluate(): unknown {
    const value = this.value();
    this.skip();
    if (this.at < this.source.length) {
      throw new SyntaxError(`unexpected "${this.source.slice(this.at)}" in formatString`);
    }
    return value;
  }

  private skip(): void {
    while (/\s/.test(this.source.charAt(this.at))) {
      this.at++;
    }
  }

  private value(): unknown {
    this.skip();
    const rest = this.source.slice(this.at);
    const quoted = QUOTED.exec(rest);
    if (quoted) {
      this.at += quoted[0].length;
      return ((quoted[1] ?? quoted[2]) as string).replace(/\\(.)/g, "$1");
    }
    if (rest.startsWith("${")) {
      const end = closeOf(this.source, this.at + 2);
      const inner = this.source.slice(this.at + 2, end - 1);
      this.at = end;
      return new Expression(inner, this.context).evaluate();
    }
    const call = CALL.exec(rest);
    if (call) {
      this.at += call[0].length;
      return this.callOf(call[1] as string);
    }
    const bare = /^[^,)\s]+/.exec(rest)?.[0] ?? "";
    this.at += bare.length;
    if (bare === "true" || bare === "false") {
      return bare === "true";
    }
    if (bare === "null") {
      return null;
    }
    if (bare !== "" && !Number.isNaN(Number(bare))) {
      return Number(bare);
    }
    return this.context.read(bare);
  }

  private callOf(name: string): unknown {
    const args: Record<string, unknown> = {};
    for (;;) {
      this.skip();
      if (this.source.charAt(this.at) === ")") {
        this.at++;
        return this.context.call(name, args);
      }
      const key = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.source.slice(this.at))?.[0];
      if (key === undefined) {
        throw new SyntaxError(`${name}() needs named arguments in formatString`);
      }
      this.at += key.length;
      this.skip();
      if (this.source.charAt(this.at++) !== ":") {
        throw new SyntaxError(`${name}() argument ${key} needs a colon in formatString`);
      }
      args[key] = this.value();
      this.skip();
      if (this.source.charAt(this.at) === ",") {
        this.at++;
      }
    }
  }
}

/** `formatString`: interpolates each `${path}` or `${fn(name: value)}` of `value`; `\${` is a literal. */
export const formatString: A2uiFunction = (args, context) => {
  const source = stringArg(args["value"], "value");
  let out = "";
  for (let i = 0; i < source.length; ) {
    if (source.startsWith("\\${", i)) {
      out += "${";
      i += 3;
    } else if (source.startsWith("${", i)) {
      const end = closeOf(source, i + 2);
      out += text(new Expression(source.slice(i + 2, end - 1), context).evaluate());
      i = end;
    } else {
      out += source.charAt(i);
      i++;
    }
  }
  return out;
};
