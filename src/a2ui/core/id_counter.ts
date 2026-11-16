/** A counter of ids unique within what shares it: each call returns `prefix-n`, n rising from 1. */
export function idCounter(): (prefix: string) => string {
  let n = 0;
  return (prefix) => {
    n += 1;
    return `${prefix}-${n}`;
  };
}
