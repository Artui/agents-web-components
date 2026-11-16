const EXPONENT = /e([+-])(\d)$/;

/**
 * `value` as compact JSON spelled the way Python's `json.dumps(value,
 * separators=(",", ":"), ensure_ascii=False)` spells it: a non-integer number
 * below 1e-4 is `1e-05`, not `0.00001`. What a parsed JS value cannot carry
 * (`1.0` against `1`, integers past 2^53, a lone surrogate) still differs.
 */
export function pythonJson(value: unknown): string {
  if (typeof value === "number") {
    return Number.isFinite(value) && !Number.isInteger(value) && Math.abs(value) < 1e-4
      ? value
          .toExponential()
          .replace(EXPONENT, (_, sign: string, digit: string) => `e${sign}0${digit}`)
      : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => pythonJson(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const members = Object.entries(value)
      .filter(([, member]) => member !== undefined)
      .map(([key, member]) => `${JSON.stringify(key)}:${pythonJson(member)}`);
    return `{${members.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
