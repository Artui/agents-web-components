import { fillUiString } from "../fill_ui_string.js";
import type { UiStrings } from "../ui_strings.js";

/** A message a child session sent its parent: its report, or a question it asks. */
export interface ChildSessionMessage {
  readonly origin: "task_output" | "task_question";
  readonly agentName: string;
  readonly threadId: string;
  readonly body: string;
  readonly outcome: string | null;
}

/** The `origin` django-spec-agents marks a woken thread's own line with. */
export const WAKE_ORIGIN = "wake";

/** The `metadata.origin` of a message no user wrote, or `null` when it names none. */
export function messageOrigin(metadata: unknown): string | null {
  const origin = (Object(metadata) as { origin?: unknown }).origin;
  return typeof origin === "string" ? origin : null;
}

/** The child's report or question a message's `metadata` marks, or `null` for any other. */
export function childSessionMessage(metadata: unknown): ChildSessionMessage | null {
  const origin = messageOrigin(metadata);
  if (origin !== "task_output" && origin !== "task_question") {
    return null;
  }
  const task = Object((Object(metadata) as { task?: unknown }).task) as Record<string, unknown>;
  if (typeof task["body"] !== "string") {
    return null;
  }
  return {
    origin,
    agentName: typeof task["agentName"] === "string" ? task["agentName"] : "",
    threadId: typeof task["threadId"] === "string" ? task["threadId"] : "",
    body: task["body"],
    outcome: typeof task["outcome"] === "string" ? task["outcome"] : null,
  };
}

type ReportStrings = Pick<UiStrings, "childReport" | "childQuestion" | "childSessionOpen">;

/** The card a child's report or question draws as, its link opening the child's thread. */
export function renderChildSessionMessage(
  message: ChildSessionMessage,
  strings: ReportStrings,
): HTMLElement {
  const card = document.createElement("div");
  card.className = "child-report";
  card.setAttribute("part", "child-report");
  card.setAttribute("data-origin", message.origin);
  if (message.outcome !== null) {
    card.setAttribute("data-outcome", message.outcome);
  }
  const agent = { agent: message.agentName };
  const title = document.createElement("div");
  title.className = "child-report-title";
  title.textContent = fillUiString(
    message.origin === "task_output" ? strings.childReport : strings.childQuestion,
    agent,
  );
  const body = document.createElement("div");
  body.className = "child-report-body";
  body.textContent = message.body;
  card.append(title, body);
  if (message.threadId !== "") {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "child-report-link";
    link.setAttribute("part", "child-report-link");
    link.setAttribute("data-thread-id", message.threadId);
    link.setAttribute("data-agent-id", message.agentName);
    link.textContent = fillUiString(strings.childSessionOpen, agent);
    card.append(link);
  }
  return card;
}
