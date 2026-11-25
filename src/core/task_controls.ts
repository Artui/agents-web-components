import { withCredentials } from "./utils.js";
import { type MaybeAsync, whenReady } from "./when_ready.js";

/** Headers for a request to `url`, read per request so rotated tokens and CSRF go with it. */
type HeadersFor = (url: string) => MaybeAsync<Record<string, string>>;

/** Live cookie policy, read per request; see `RemoteConversationStore`'s note. */
type CredentialsProvider = () => RequestCredentials | undefined;

/** One control a user can send a running sub-agent task. */
export type TaskControlAction =
  | { readonly kind: "steer"; readonly message: string }
  | { readonly kind: "answer"; readonly questionId: string; readonly answer: string }
  | { readonly kind: "cancel"; readonly force: boolean };

/**
 * What the server said to a control: accepted, or refused with its status and
 * the route's `reason` code (`null` when the body was not the route's JSON, as
 * from a server without the routes, or `status` 0 for a fault).
 */
export type TaskControlResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: number; readonly reason: string | null };

/**
 * The three task routes django-ag-ui (0.91.0+) serves beside each thread,
 * derived from `data-threads-url` as {@link DetachedRuns} derives its two:
 *
 * - `POST <url><id>/tasks/<task>/steer/` with `{"message"}`;
 * - `POST <url><id>/tasks/<task>/answer/` with `{"question_id", "answer"}`;
 * - `POST <url><id>/tasks/<task>/cancel/` with `{"force"}`.
 *
 * Each is acknowledged with `202` and nothing a caller should draw: the task's
 * state arrives on the run's stream. Each request is sent once. A control is
 * not idempotent (a steer sent twice is two messages), so it is never retried,
 * on a `401` or otherwise.
 */
export class TaskControls {
  readonly #url: string;
  readonly #headers: HeadersFor;
  readonly #credentials: CredentialsProvider;

  private constructor(threadsUrl: string, headers: HeadersFor, credentials: CredentialsProvider) {
    this.#url = threadsUrl.endsWith("/") ? threadsUrl : `${threadsUrl}/`;
    this.#headers = headers;
    this.#credentials = credentials;
  }

  /** The routes beside `threadsUrl`, or `null` when the element has none. */
  static from(
    threadsUrl: string | null,
    headers: HeadersFor,
    credentials: CredentialsProvider,
  ): TaskControls | null {
    return threadsUrl === null ? null : new TaskControls(threadsUrl, headers, credentials);
  }

  /** Send one control to the task `taskId` of the thread `threadId`. Never throws. */
  async send(
    threadId: string,
    taskId: string,
    action: TaskControlAction,
  ): Promise<TaskControlResult> {
    const url = `${this.#url}${encodeURIComponent(threadId)}/tasks/${encodeURIComponent(taskId)}/${action.kind}/`;
    try {
      const response = await whenReady(this.#headers(url), (headers) =>
        fetch(
          url,
          withCredentials(
            {
              method: "POST",
              headers: {
                ...headers,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify(requestBody(action)),
            },
            this.#credentials(),
          ),
        ),
      );
      if (response.ok) {
        return { ok: true };
      }
      return { ok: false, status: response.status, reason: await reasonOf(response) };
    } catch {
      return { ok: false, status: 0, reason: null };
    }
  }
}

/** The route's body, in the server's snake_case. */
function requestBody(action: TaskControlAction): Record<string, unknown> {
  if (action.kind === "steer") {
    return { message: action.message };
  }
  if (action.kind === "answer") {
    return { question_id: action.questionId, answer: action.answer };
  }
  return { force: action.force };
}

/** A refusal's `reason` code, or `null` for a body that is not the route's JSON. */
async function reasonOf(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return null;
    }
    const reason = (body as Record<string, unknown>)["reason"];
    return typeof reason === "string" ? reason : null;
  } catch {
    return null;
  }
}
