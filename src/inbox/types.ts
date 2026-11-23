import type { Interrupt } from "@ag-ui/core";
import type { AgentEntry, InboxRow } from "../agents/types.js";

/** A row as `<ag-ui-inbox>` lists it: an inbox row of `<ag-ui-agents>` that waits on the user. */
export type InboxItem = InboxRow & { readonly interrupts: readonly Interrupt[] };

/**
 * The part of `<ag-ui-agents>` the inbox reads and drives, kept structural so
 * this entry never imports the provider.
 */
export type InboxProvider = HTMLElement & {
  readonly inbox: readonly InboxRow[];
  readonly agents: readonly AgentEntry[];
  readonly headers?: Record<string, string>;
  readonly getHeaders?: (() => Record<string, string>) | null;
  readonly credentials?: RequestCredentials | null;
  openThread(agentId: string, threadId: string): Promise<void>;
};

/** How the inbox is drawn: a badge that opens the list, or the list alone. */
export type InboxVariant = "badge" | "list";

/** What one interrupt waits on, from its `metadata.kind`; anything else reads `external`. */
export type InboxKind = "approval" | "question" | "external";

/** `detail` shape of the {@link INBOX_SELECT_EVENT} CustomEvent. */
export interface InboxSelectDetail {
  /** The agent the conversation belongs to. */
  readonly agentId: string;
  /** The conversation picked. */
  readonly threadId: string;
}

/** What came of an answer given in place. */
export type InboxAnswerOutcome = "answered" | "elsewhere" | "failed";

/** `detail` shape of the {@link INBOX_ANSWER_EVENT} CustomEvent. */
export interface InboxAnswerDetail {
  readonly agentId: string;
  readonly threadId: string;
  /** The parked run answered. */
  readonly runId: string;
  /** `true` for Approve, `false` for Deny. */
  readonly approved: boolean;
  readonly outcome: InboxAnswerOutcome;
  /** The HTTP status, or `0` when the request never got an answer. */
  readonly status: number;
}

/** Every piece of text the inbox draws; set `strings` to translate it. */
export interface InboxStrings {
  /** The list's accessible name, and the popover's heading. */
  readonly label: string;
  /** The badge's accessible name; `{count}` is how many conversations wait. */
  readonly badge: string;
  /** The list's text when nothing waits. */
  readonly empty: string;
  /** A row whose thread has no title yet. */
  readonly untitled: string;
  /** What an approval waits on. */
  readonly approval: string;
  /** What a question waits on. */
  readonly question: string;
  /** What any other parked call waits on: a client tool, say. */
  readonly external: string;
  /** The mark on an approval for a destructive call. */
  readonly destructive: string;
  /** After a row's first interrupt, when there are more; `{count}` is how many more. */
  readonly more: string;
  /** The in-place answer that runs the approved calls. */
  readonly approve: string;
  /** The in-place answer that declines them. */
  readonly deny: string;
  /** Under a row whose in-place answer failed. */
  readonly answerFailed: string;
}

/** What the `strings` setter takes: any of {@link InboxStrings}. */
export type InboxStringsInput = Partial<InboxStrings>;
