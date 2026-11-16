/** `value` as a finite number, a numeric string accepted, else a thrown `TypeError`. */
export function numberArg(value: unknown, name: string): number {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) {
    throw new TypeError(`${name} must be a number`);
  }
  return number;
}

/** `value` as a string, else a thrown `TypeError`. */
export function stringArg(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  return value;
}
