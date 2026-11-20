import type { EditorSkill } from "./editor_skill.js";

/**
 * One editor entry from the wire, or `null` when any field is missing or of
 * the wrong type: a half-read skill would save back over the real one.
 */
export function parseEditorSkill(value: unknown): EditorSkill | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const entry = value as Record<string, unknown>;
  const { id, name, description, body, userInvocable, modelInvocable, enabled } = entry;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    typeof body !== "string" ||
    typeof userInvocable !== "boolean" ||
    typeof modelInvocable !== "boolean" ||
    typeof enabled !== "boolean"
  ) {
    return null;
  }
  return { id, name, description, body, userInvocable, modelInvocable, enabled };
}
