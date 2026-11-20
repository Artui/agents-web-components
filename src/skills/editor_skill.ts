/**
 * A stored skill as django-ag-ui's skill editor endpoint serves it: the one
 * place a skill's body reaches the browser, and only for a skill the caller
 * may write.
 */
export interface EditorSkill {
  /** The server's id for the row, used in the item URL. */
  readonly id: string;
  /** The `/token` in the palette (kebab-case, checked by the server). */
  readonly name: string;
  /** What the agent reads until it loads the skill. */
  readonly description: string;
  /** The instructions themselves. */
  readonly body: string;
  /** Offered in the `/` palette. */
  readonly userInvocable: boolean;
  /** The agent may load it on its own. */
  readonly modelInvocable: boolean;
  /** Off skills stay listed in the editor and nowhere else. */
  readonly enabled: boolean;
}

/** What a create or a replace sends: an {@link EditorSkill} less `id` and `enabled`. */
export type EditorSkillDraft = Omit<EditorSkill, "id" | "enabled">;
