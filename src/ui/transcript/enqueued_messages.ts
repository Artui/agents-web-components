import {
  type ChildSessionMessage,
  childSessionMessage,
  renderChildSessionMessage,
} from "../progress/child_session_report.js";

/**
 * Draw the user messages pydantic-ai's adapter reports a run took in while it
 * was working (`RunContext.enqueue`), as user bubbles under one caption.
 *
 * `content` is `{ messages }`, AG-UI messages as the adapter dumps them. Only a
 * user message's text is drawn, as text and never as HTML: a string `content`,
 * or the `text` of each `{ type: "text" }` part. Anything else draws nothing,
 * and so does a list with no user text, as an empty fragment (see
 * {@link ActivityRenderer}) rather than an empty caption.
 *
 * A child session's report or question (`metadata.origin` `task_output` or
 * `task_question`) is drawn as a card from the child, from its plain `body`,
 * never as the framed text the model saw; the caption is for user lines only.
 *
 * The bubbles land inside the answer group the run is drawing, which is where
 * they were delivered, so the wrapper is a column of its own: that is what
 * keeps them right-aligned there.
 */
export function renderEnqueuedMessages(
  content: unknown,
  caption: string,
  strings: Parameters<typeof renderChildSessionMessage>[1],
): Node {
  const entries = userEntries(content);
  if (entries.length === 0) {
    return document.createDocumentFragment();
  }
  const wrapper = document.createElement("div");
  wrapper.className = "enqueued-messages";
  wrapper.setAttribute("part", "enqueued-messages");
  let users = 0;
  for (const entry of entries) {
    if (typeof entry !== "string") {
      wrapper.append(renderChildSessionMessage(entry, strings));
      continue;
    }
    const bubble = document.createElement("div");
    bubble.className = "message message--user";
    bubble.setAttribute("part", "message message-user");
    bubble.textContent = entry;
    wrapper.append(bubble);
    users += 1;
  }
  if (users > 0) {
    const note = document.createElement("div");
    note.className = "enqueued-messages-note";
    note.setAttribute("part", "enqueued-messages-note");
    note.textContent = caption;
    wrapper.append(note);
  }
  return wrapper;
}

function userEntries(content: unknown): (string | ChildSessionMessage)[] {
  const messages = recordOf(content)?.["messages"];
  if (!Array.isArray(messages)) {
    return [];
  }
  const entries: (string | ChildSessionMessage)[] = [];
  for (const message of messages) {
    const record = recordOf(message);
    if (record?.["role"] !== "user") {
      continue;
    }
    const child = childSessionMessage(record["metadata"]);
    const text = textOf(record["content"]);
    if (child !== null) {
      entries.push(child);
    } else if (text.trim() !== "") {
      entries.push(text);
    }
  }
  return entries;
}

function textOf(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const part of content) {
    const record = recordOf(part);
    const text = record?.["text"];
    if (record?.["type"] === "text" && typeof text === "string") {
      parts.push(text);
    }
  }
  return parts.join("\n");
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}
