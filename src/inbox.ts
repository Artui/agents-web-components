// The ./inbox entry: what needs the user across agents, as a badge or a list.

export { INBOX_SELECT_EVENT, INBOX_TAG } from "./constants.js";
export { AgUiInbox } from "./inbox/ag_ui_inbox.js";
export { defineInbox } from "./inbox/define_inbox.js";
export type {
  InboxItem,
  InboxKind,
  InboxProvider,
  InboxSelectDetail,
  InboxStrings,
  InboxStringsInput,
  InboxVariant,
} from "./inbox/types.js";
