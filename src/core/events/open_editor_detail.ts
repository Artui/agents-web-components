/** `detail` shape of the {@link OPEN_EDITOR_EVENT} CustomEvent. */
export interface OpenEditorDetail {
  /** The editor asked for: `routines` or `skills`. */
  readonly editor: string;
  /** Whether the ask was Make this a routine: a new routine's form, filled from the conversation. */
  readonly fromConversation: boolean;
}
