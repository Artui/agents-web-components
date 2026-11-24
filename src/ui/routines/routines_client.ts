/** When a routine fires: weekly at a wall time (0 is Monday), or every few hours. */
export type RoutineSchedule =
  | { readonly kind: "weekly"; readonly weekdays: readonly number[]; readonly at: string }
  | { readonly kind: "interval"; readonly every_hours: number };

/** A tool a routine may run unasked, with the destructive flag pinned when it was granted. */
export interface GrantableTool {
  readonly name: string;
  readonly destructive: boolean;
}

/** A routine as django-ag-ui's `RoutineEditorView` answers it. */
export interface Routine {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly schedule: RoutineSchedule;
  readonly timezone: string;
  readonly enabled: boolean;
  /** Why the sweep paused it, `""` when it did not. */
  readonly pausedReason: string;
  /** The next firing (ISO), `null` while it is paused. */
  readonly nextFireAt: string | null;
  readonly preapprovedTools: readonly GrantableTool[];
  readonly lastThreadId: string | null;
}

/** The body of a create or a full replace. */
export interface RoutineDraft {
  readonly name: string;
  readonly prompt: string;
  readonly schedule: RoutineSchedule;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly preapprovedTools: readonly string[];
  /** Every destructive tool in the grant, named on every write, edits included. */
  readonly confirmDestructive: readonly string[];
}

/** The list answer: the caller's routines and the tools a routine may be granted. */
export interface RoutineList {
  readonly routines: readonly Routine[];
  readonly grantable: readonly GrantableTool[];
}

/** One firing from `runs/`, newest first. */
export interface RoutineRun {
  readonly threadId: string | null;
  /** `pending`, `lapsed`, `finished`, or `null` when the queue cannot say. */
  readonly state: string | null;
}

/** A call the server refused, with what it said. */
export interface RoutinesRefusal {
  readonly ok: false;
  /** The HTTP status, or `0` when the request never got an answer. */
  readonly status: number;
  readonly message: string | null;
  /** The destructive tools a 409 says were granted unconfirmed. */
  readonly destructive: readonly string[];
}

/** What one call to the routines endpoint came back with. */
export type RoutinesResult<T> = { readonly ok: true; readonly value: T } | RoutinesRefusal;

/** `fetch` as the element authenticates, read at the moment of each request. */
export type RoutinesRequest = (url: string, init: RequestInit) => Promise<Response>;

/**
 * The calls django-ag-ui's routines editor answers, over the element's own
 * authenticated `request`: list, create, replace, pause or resume, run now,
 * and the last firings. The view checks CSRF by default and refuses a write
 * that is not JSON, so every write sends a JSON body.
 */
export class RoutinesClient {
  readonly #url: string;
  readonly #request: RoutinesRequest;

  constructor(url: string, request: RoutinesRequest) {
    // The item routes are `<base><id>/`; Django cannot redirect a PUT to add a slash.
    this.#url = url.endsWith("/") ? url : `${url}/`;
    this.#request = request;
  }

  /** The caller's routines on this mount, and the tools a routine may be granted. */
  list(): Promise<RoutinesResult<RoutineList>> {
    return this.#call(this.#url, { method: "GET" }, (body) => {
      const { routines, grantable } = (body ?? {}) as { routines?: unknown; grantable?: unknown };
      if (!Array.isArray(routines)) {
        return null;
      }
      return {
        routines: routines.map(parseRoutine).filter((routine) => routine !== null),
        grantable: Array.isArray(grantable) ? parseTools(grantable) : [],
      };
    });
  }

  /** Create a routine from a whole draft. */
  create(draft: RoutineDraft): Promise<RoutinesResult<Routine>> {
    return this.#write(this.#url, "POST", draft, parseRoutine);
  }

  /** Replace a routine whole. */
  update(id: string, draft: RoutineDraft): Promise<RoutinesResult<Routine>> {
    return this.#write(this.#item(id), "PUT", draft, parseRoutine);
  }

  /** Pause a routine, or resume it. */
  setEnabled(id: string, enabled: boolean): Promise<RoutinesResult<Routine>> {
    return this.#write(this.#item(id), "PATCH", { enabled }, parseRoutine);
  }

  /** Fire a routine now, paused or not; the answer names the thread it runs in. */
  runNow(id: string): Promise<RoutinesResult<string>> {
    return this.#write(`${this.#item(id)}run/`, "POST", {}, (body) => {
      const threadId = (body as { threadId?: unknown } | null)?.threadId;
      return typeof threadId === "string" ? threadId : null;
    });
  }

  /** The routine's firings, newest first. */
  runs(id: string): Promise<RoutinesResult<readonly RoutineRun[]>> {
    return this.#call(`${this.#item(id)}runs/`, { method: "GET" }, (body) => {
      const runs = (body as { runs?: unknown } | null)?.runs;
      if (!Array.isArray(runs)) {
        return null;
      }
      return runs.map((run: unknown) => {
        const { threadId, state } = (run ?? {}) as Record<string, unknown>;
        return {
          threadId: typeof threadId === "string" ? threadId : null,
          state: typeof state === "string" ? state : null,
        };
      });
    });
  }

  #item(id: string): string {
    return `${this.#url}${encodeURIComponent(id)}/`;
  }

  #write<T>(
    url: string,
    method: string,
    body: unknown,
    read: (body: unknown) => T | null,
  ): Promise<RoutinesResult<T>> {
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
    return this.#call(url, init, read);
  }

  async #call<T>(
    url: string,
    init: RequestInit,
    read: (body: unknown) => T | null,
  ): Promise<RoutinesResult<T>> {
    let response: Response;
    try {
      response = await this.#request(url, init);
    } catch {
      return { ok: false, status: 0, message: null, destructive: [] };
    }
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const value = read(body);
      if (value !== null) {
        return { ok: true, value };
      }
    }
    const { error, destructive } = (body ?? {}) as Record<string, unknown>;
    return {
      ok: false,
      status: response.status,
      message: typeof error === "string" ? error : null,
      destructive: Array.isArray(destructive)
        ? destructive.filter((name): name is string => typeof name === "string")
        : [],
    };
  }
}

function parseTools(raw: readonly unknown[]): GrantableTool[] {
  const tools: GrantableTool[] = [];
  for (const entry of raw) {
    const { name, destructive } = (entry ?? {}) as Record<string, unknown>;
    if (typeof name === "string") {
      tools.push({ name, destructive: destructive === true });
    }
  }
  return tools;
}

function parseSchedule(raw: unknown): RoutineSchedule | null {
  const schedule = (raw ?? {}) as Record<string, unknown>;
  const { kind, weekdays, at } = schedule;
  const every = schedule["every_hours"];
  if (kind === "weekly" && Array.isArray(weekdays) && typeof at === "string") {
    const days = weekdays.filter((day): day is number => Number.isInteger(day));
    return { kind, weekdays: days, at };
  }
  if (kind === "interval" && typeof every === "number") {
    return { kind, every_hours: every };
  }
  return null;
}

function parseRoutine(raw: unknown): Routine | null {
  const entry = (raw ?? {}) as Record<string, unknown>;
  const { id, name, prompt, timezone, pausedReason, nextFireAt, lastThreadId } = entry;
  const schedule = parseSchedule(entry["schedule"]);
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof prompt !== "string" ||
    typeof timezone !== "string" ||
    schedule === null
  ) {
    return null;
  }
  const tools = entry["preapprovedTools"];
  return {
    id,
    name,
    prompt,
    schedule,
    timezone,
    enabled: entry["enabled"] !== false,
    pausedReason: typeof pausedReason === "string" ? pausedReason : "",
    nextFireAt: typeof nextFireAt === "string" ? nextFireAt : null,
    preapprovedTools: Array.isArray(tools) ? parseTools(tools) : [],
    lastThreadId: typeof lastThreadId === "string" ? lastThreadId : null,
  };
}
