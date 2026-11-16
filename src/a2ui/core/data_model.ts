type Listener = () => void;

/**
 * One surface's data model: a JSON value read and written by JSON Pointer
 * (RFC 6901), with listeners told after every write.
 *
 * Writes follow `updateDataModel`'s upsert rules, which the spec also gives an
 * input bound to a path the agent never set: a missing path is created (as
 * objects, or as an array where the next token is an index into an existing
 * array), `null` removes the key or the array item, and the root (`""` or
 * `"/"`) replaces the whole model.
 */
export class DataModel {
  #root: unknown;
  #listeners: Listener[] = [];

  constructor(root: unknown = {}) {
    this.#root = root;
  }

  /** The value at `pointer`, or `undefined` when any token on the way is missing. */
  get(pointer: string): unknown {
    let cursor: unknown = this.#root;
    for (const token of tokens(pointer)) {
      if (Array.isArray(cursor)) {
        cursor = isIndex(token) ? cursor[Number(token)] : undefined;
      } else if (isObject(cursor) && Object.hasOwn(cursor, token)) {
        cursor = cursor[token];
      } else {
        return undefined;
      }
    }
    return cursor;
  }

  /** Write `value` at `pointer` (`null` removes it), then tell every listener. */
  set(pointer: string, value: unknown): void {
    const path = tokens(pointer);
    const last = path.pop();
    if (last === undefined) {
      this.#root = value === null ? {} : value;
    } else {
      if (!isObject(this.#root) && !Array.isArray(this.#root)) {
        this.#root = {};
      }
      let parent = this.#root as Record<string, unknown> | unknown[];
      for (const [i, token] of path.entries()) {
        const next = readChild(parent, token);
        if (isObject(next) || Array.isArray(next)) {
          parent = next;
        } else {
          const created: Record<string, unknown> | unknown[] = isIndex(path[i + 1] ?? last)
            ? []
            : {};
          writeChild(parent, token, created);
          parent = created;
        }
      }
      if (value === null) {
        removeChild(parent, last);
      } else {
        writeChild(parent, last, value);
      }
    }
    for (const listener of this.#listeners) {
      listener();
    }
  }

  /** Call `listener` after every write; returns the function that stops it. */
  subscribe(listener: Listener): () => void {
    this.#listeners = [...this.#listeners, listener];
    return () => {
      this.#listeners = this.#listeners.filter((other) => other !== listener);
    };
  }
}

function tokens(pointer: string): string[] {
  if (pointer === "" || pointer === "/") {
    return [];
  }
  return pointer
    .replace(/^\//, "")
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function isIndex(token: string): boolean {
  return /^(0|[1-9]\d*)$/.test(token);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readChild(parent: Record<string, unknown> | unknown[], token: string): unknown {
  if (Array.isArray(parent)) {
    return isIndex(token) ? parent[Number(token)] : undefined;
  }
  return Object.hasOwn(parent, token) ? parent[token] : undefined;
}

function writeChild(parent: Record<string, unknown> | unknown[], token: string, value: unknown) {
  if (Array.isArray(parent)) {
    if (isIndex(token)) {
      parent[Number(token)] = value;
    }
  } else {
    // defineProperty, so a `__proto__` token is an own key and never a prototype.
    Object.defineProperty(parent, token, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
}

function removeChild(parent: Record<string, unknown> | unknown[], token: string): void {
  if (Array.isArray(parent)) {
    if (isIndex(token) && Number(token) < parent.length) {
      parent.splice(Number(token), 1);
    }
  } else {
    delete parent[token];
  }
}
