import type { EditorSkill, EditorSkillDraft } from "./editor_skill.js";
import { parseEditorSkill } from "./parse_editor_skill.js";

/** A write or a list the server refused, with what it said. */
export interface SkillEditorRefusal {
  readonly ok: false;
  /** The HTTP status, or `0` when the request never got an answer. */
  readonly status: number;
  /** The server's `error`, or `null` when its body carried none. */
  readonly message: string | null;
  /** The draft field the refusal names, when the server says which. */
  readonly field: string | null;
}

/** What one call to the editor endpoint came back with. */
export type SkillEditorResult<T> = { readonly ok: true; readonly value: T } | SkillEditorRefusal;

/** `fetch` as the element authenticates, read at the moment of each request. */
export type SkillEditorRequest = (url: string, init: RequestInit) => Promise<Response>;

/**
 * The calls django-ag-ui's `SkillEditorView` answers, over the element's own
 * authenticated `request`: list, create, replace, and turn off or on.
 *
 * The view is CSRF-checked by default, so every call goes through `request`,
 * which reads the host's headers live rather than once: a rotated token
 * reaches the next write.
 */
export class SkillEditorClient {
  readonly #url: string;
  readonly #request: SkillEditorRequest;

  constructor(url: string, request: SkillEditorRequest) {
    // The item routes are `<base><id>/`; Django cannot redirect a PUT to add a slash.
    this.#url = url.endsWith("/") ? url : `${url}/`;
    this.#request = request;
  }

  /** Every skill the caller may write, disabled ones included. */
  list(): Promise<SkillEditorResult<readonly EditorSkill[]>> {
    return this.#call(this.#url, { method: "GET" }, (body) => {
      const skills = (body as { skills?: unknown } | null)?.skills;
      if (!Array.isArray(skills)) {
        return null;
      }
      return skills.map(parseEditorSkill).filter((skill) => skill !== null);
    });
  }

  /** Create a skill from a whole draft. */
  create(draft: EditorSkillDraft): Promise<SkillEditorResult<EditorSkill>> {
    return this.#write(this.#url, "POST", draft);
  }

  /** Replace a skill's name, description, body and flags. */
  update(id: string, draft: EditorSkillDraft): Promise<SkillEditorResult<EditorSkill>> {
    return this.#write(this.#item(id), "PUT", draft);
  }

  /** Turn a skill off, or back on. */
  setEnabled(id: string, enabled: boolean): Promise<SkillEditorResult<EditorSkill>> {
    return this.#write(this.#item(id), "PATCH", { enabled });
  }

  #item(id: string): string {
    return `${this.#url}${encodeURIComponent(id)}/`;
  }

  #write(url: string, method: string, body: unknown): Promise<SkillEditorResult<EditorSkill>> {
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
    return this.#call(url, init, parseEditorSkill);
  }

  async #call<T>(
    url: string,
    init: RequestInit,
    read: (body: unknown) => T | null,
  ): Promise<SkillEditorResult<T>> {
    let response: Response;
    try {
      response = await this.#request(url, init);
    } catch {
      return { ok: false, status: 0, message: null, field: null };
    }
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const value = read(body);
      if (value !== null) {
        return { ok: true, value };
      }
    }
    const envelope = (typeof body === "object" && body !== null ? body : {}) as Record<
      string,
      unknown
    >;
    const { error, field } = envelope;
    return {
      ok: false,
      status: response.status,
      message: typeof error === "string" ? error : null,
      field: typeof field === "string" ? field : null,
    };
  }
}
