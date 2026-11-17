import type { McpAppActivity } from "./types.js";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The activity content as {@link McpAppActivity}, or `null` when it is not one. */
export function readActivity(content: unknown): McpAppActivity | null {
  if (!isRecord(content) || typeof content["resourceUri"] !== "string") {
    return null;
  }
  const { resourceUri, toolInput, result, serverId, serverHash } = content;
  if (!isRecord(toolInput) || !isRecord(result)) {
    return null;
  }
  return {
    resourceUri,
    toolInput,
    result,
    ...(typeof serverId === "string" && serverId !== "" ? { serverId } : {}),
    ...(typeof serverHash === "string" ? { serverHash } : {}),
  };
}
