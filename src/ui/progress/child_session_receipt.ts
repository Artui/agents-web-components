/**
 * What a `start_session` call returns when it started a child: the child's
 * agent and thread, the two things a link to it needs.
 */
export interface ChildSessionReceipt {
  readonly agentId: string;
  readonly threadId: string;
}

/** The child-session tool whose result is a receipt. */
const START_SESSION = "start_session";

/**
 * The receipt in a tool result, or `null` for anything else.
 *
 * Read off the result rather than off SUBAGENT_* events because a child session
 * runs headless in its own thread and sends none, and because the result is
 * the part that persists: the live settle and a restore read the same text, so
 * a reload links where the run did. A refusal is a different shape and returns
 * `null`, as does any text that is not JSON. Never throws.
 */
export function childSessionReceipt(
  toolName: string | null,
  content: string,
): ChildSessionReceipt | null {
  if (toolName !== START_SESSION) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const { agent_id: agentId, thread_id: threadId } = parsed as Record<string, unknown>;
  if (typeof agentId !== "string" || typeof threadId !== "string" || threadId === "") {
    return null;
  }
  return { agentId, threadId };
}
