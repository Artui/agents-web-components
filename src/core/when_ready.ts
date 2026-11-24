/** A value, or the promise of one: what a host's `getHeaders` may return. */
export type MaybeAsync<T> = T | Promise<T>;

/**
 * Hand `value` to `use` now when it is plain, and once it settles when it is a
 * thenable, whose rejection then rejects the result.
 *
 * Branching rather than awaiting is the point: a synchronous header source must
 * reach `fetch` in the same tick it always did, since an added await reorders
 * the timing-sensitive suites.
 */
export function whenReady<T, R>(
  value: MaybeAsync<T>,
  use: (resolved: T) => R,
): R | Promise<Awaited<R>> {
  if (isThenable(value)) {
    return Promise.resolve(value).then(use) as Promise<Awaited<R>>;
  }
  return use(value);
}

function isThenable<T>(value: MaybeAsync<T>): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
