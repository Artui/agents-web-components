/**
 * A user's action on a surface, the body of A2UI 1.0's renderer-to-agent
 * `action` message, keys in the spec's order.
 */
export interface UserAction {
  readonly name: string;
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly timestamp: string;
  readonly userMessage?: string;
  readonly context: Readonly<Record<string, unknown>>;
}
