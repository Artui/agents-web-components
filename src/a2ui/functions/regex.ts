import type { A2uiFunction } from "../core/a2ui_function.js";

const MAX_PATTERN_CODE_POINTS = 256;
const UNBOUNDED = /^(?:[*+]|\{\d+,\})/;
const FORBIDDEN = /^(?:[1-9]|k<|[pP]\{)/;

interface Group {
  nested: boolean;
  alternates: boolean;
}

function mark(groups: readonly Group[], key: keyof Group): void {
  const group = groups.at(-1);
  if (group !== undefined) {
    group[key] = true;
  }
}

/** Whether the A2UI regex dialect forbids `pattern`: backreferences, lookbehind, named groups, `\p`, nested or alternating unbounded quantifiers. */
function rejected(pattern: string): boolean {
  if ([...pattern].length > MAX_PATTERN_CODE_POINTS) {
    return true;
  }
  const groups: Group[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern.charAt(i);
    if (char === "\\") {
      if (FORBIDDEN.test(pattern.slice(i + 1, i + 4))) {
        return true;
      }
      i++;
    } else if (inClass) {
      inClass = char !== "]";
    } else if (char === "[") {
      inClass = true;
    } else if (char === "(") {
      if (/^\(\?<[=!A-Za-z_$]/.test(pattern.slice(i, i + 4))) {
        return true;
      }
      groups.push({ nested: false, alternates: false });
    } else if (char === ")") {
      const inner = groups.pop() ?? { nested: false, alternates: false };
      const repeated = UNBOUNDED.test(pattern.slice(i + 1));
      if (repeated && (inner.nested || inner.alternates)) {
        return true;
      }
      if (inner.nested || repeated) {
        mark(groups, "nested");
      }
    } else if (char === "|") {
      mark(groups, "alternates");
    } else if (UNBOUNDED.test(pattern.slice(i))) {
      mark(groups, "nested");
    }
  }
  return false;
}

/** `regex`: the value contains a match for `pattern`; an invalid or rejected pattern is `valid: false`, never a throw. */
export const regex: A2uiFunction = (args) => {
  const { value, pattern } = args;
  if (typeof pattern !== "string" || value === null || value === undefined) {
    return { valid: false };
  }
  let compiled: RegExp;
  try {
    if (rejected(pattern)) {
      return { valid: false, code: "invalid_pattern" };
    }
    compiled = new RegExp(pattern, "u");
  } catch {
    return { valid: false, code: "invalid_pattern" };
  }
  return { valid: compiled.test(String(value)) };
};
