import type { A2uiFunction } from "../core/a2ui_function.js";

const MAX_PATTERN_CODE_POINTS = 256;
const UNBOUNDED = /^(?:[*+]|\{\d+,\})/;
const FORBIDDEN = /^(?:[1-9]|k<|[pP]\{)/;

/** Whether the A2UI regex dialect forbids `pattern`: backreferences, lookbehind, named groups, `\p`, nested unbounded quantifiers. */
function rejected(pattern: string): boolean {
  if ([...pattern].length > MAX_PATTERN_CODE_POINTS) {
    return true;
  }
  const groups: boolean[] = [];
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
      groups.push(false);
    } else if (char === ")") {
      const inner = groups.pop() ?? false;
      const next = pattern.slice(i + 1);
      const repeated = UNBOUNDED.test(next);
      if (inner && repeated) {
        return true;
      }
      if (groups.length > 0 && (inner || repeated)) {
        groups[groups.length - 1] = true;
      }
    } else if (groups.length > 0 && UNBOUNDED.test(pattern.slice(i))) {
      groups[groups.length - 1] = true;
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
