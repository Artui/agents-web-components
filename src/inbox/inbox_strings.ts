import type { InboxStrings } from "./types.js";

/** The inbox's English text; a host's `strings` is merged over it. */
export const DEFAULT_INBOX_STRINGS: InboxStrings = {
  label: "Needs you",
  badge: "Needs you: {count}",
  empty: "Nothing needs you",
  untitled: "New conversation",
  approval: "Approval",
  question: "Question",
  external: "Action needed",
  destructive: "Destructive",
  more: "+{count} more",
  approve: "Approve",
  deny: "Deny",
  answerFailed: "Could not send the answer. Open the conversation to answer there.",
};
