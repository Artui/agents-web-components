/** One open thread: a tab a host draws, without the messages behind it. */
export interface OpenThread {
  readonly threadId: string;
  /** The thread's title; `""` until one is known (nothing sent yet, or not listed). */
  readonly title: string;
}

/** Where an {@link OpenThreads} keeps its list; the owner decides the key. */
export interface OpenThreadsStorage {
  readonly read: () => string | null;
  readonly write: (value: string) => void;
}

/**
 * The ordered set of threads open in one `<ag-ui-chat>`, apart from its
 * history: closing one forgets the tab and keeps the thread.
 *
 * Owned one-to-one by an element, which says when the set changes; this only
 * keeps the order and writes each change through the storage it was handed,
 * so a reload reads the same tabs back without asking the store for titles.
 * Each mutator answers whether anything changed, so the element reports a
 * change exactly when there was one.
 */
export class OpenThreads {
  readonly #storage: OpenThreadsStorage;
  #tabs: readonly OpenThread[] = Object.freeze([]);

  constructor(storage: OpenThreadsStorage) {
    this.#storage = storage;
  }

  /** The open threads in order, frozen; a later change does not reach a copy handed out. */
  get tabs(): readonly OpenThread[] {
    return this.#tabs;
  }

  /** Read the stored set back, keeping only well-formed, distinct entries. */
  load(): void {
    this.#tabs = Object.freeze(parse(this.#storage.read()));
  }

  has(threadId: string): boolean {
    return this.#tabs.some((tab) => tab.threadId === threadId);
  }

  /** Open `threadId` last, unless it is open already. */
  open(threadId: string, title: string): boolean {
    if (this.has(threadId)) {
      return false;
    }
    this.#save([...this.#tabs, tab(threadId, title)]);
    return true;
  }

  close(threadId: string): boolean {
    if (!this.has(threadId)) {
      return false;
    }
    this.#save(this.#tabs.filter((open) => open.threadId !== threadId));
    return true;
  }

  retitle(threadId: string, title: string): boolean {
    if (!this.#tabs.some((open) => open.threadId === threadId && open.title !== title)) {
      return false;
    }
    this.#save(
      this.#tabs.map((open) => (open.threadId === threadId ? tab(threadId, title) : open)),
    );
    return true;
  }

  /** Put `threadId` where `previous` was, keeping its place in the order. */
  replace(previous: string, threadId: string, title: string): boolean {
    if (!this.has(previous)) {
      return false;
    }
    this.#save(
      this.#tabs.map((open) => (open.threadId === previous ? tab(threadId, title) : open)),
    );
    return true;
  }

  /** The tab that takes over when `threadId` closes: the next one, else the one before. */
  neighbour(threadId: string): string | null {
    const index = this.#tabs.findIndex((open) => open.threadId === threadId);
    if (index === -1) {
      return null;
    }
    return (this.#tabs[index + 1] ?? this.#tabs[index - 1])?.threadId ?? null;
  }

  /** The open threads, `except` one, whose title is not known yet. */
  untitled(except: string): string[] {
    return this.#tabs
      .filter((open) => open.title === "" && open.threadId !== except)
      .map((open) => open.threadId);
  }

  #save(tabs: readonly OpenThread[]): void {
    this.#tabs = Object.freeze(tabs);
    this.#storage.write(JSON.stringify(tabs));
  }
}

function tab(threadId: string, title: string): OpenThread {
  return Object.freeze({ threadId, title });
}

function parse(stored: string | null): OpenThread[] {
  let value: unknown;
  try {
    value = JSON.parse(stored ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const tabs: OpenThread[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const { threadId, title } = entry as Record<string, unknown>;
    if (
      typeof threadId === "string" &&
      threadId !== "" &&
      typeof title === "string" &&
      !tabs.some((open) => open.threadId === threadId)
    ) {
      tabs.push(tab(threadId, title));
    }
  }
  return tabs;
}
