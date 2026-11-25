/**
 * The flat table of every user-facing string the chat shell renders — labels,
 * placeholders, `aria-label`s, and `title` tooltips. A localizable seam, not a
 * framework: a host overrides any subset (via the element's `strings` property
 * or its `data-strings` JSON attribute) and the rest fall back to the English
 * defaults.
 *
 * Some values are templates carrying `{token}` placeholders the call site fills
 * in; the token names are noted on each key, and a translation must keep them
 * verbatim.
 */
export interface UiStrings {
  // ── Header ────────────────────────────────────────────────────────────────
  /** Default header title (the `title-text` attribute overrides per element). */
  title: string;
  /** History button + drawer dialog label. */
  chatHistory: string;
  /** Dismiss the chat-history list and return to the conversation. */
  closeHistory: string;
  /** Placeholder in the conversation-list filter. */
  searchConversations: string;
  /** Names the row of messages waiting for the run to finish. */
  queued: string;
  /** Drops one waiting message. `{text}` is the message. */
  removeQueued: string;
  /** Shown when a filter matches nothing, unlike having no conversations. */
  noMatches: string;
  /** Heading over the conversations last active today. */
  threadsToday: string;
  /** Heading over the conversations last active in the seven days before today. */
  threadsPreviousWeek: string;
  /** Heading over every older conversation, and any with no readable date. */
  threadsOlder: string;
  /** Notice text when the agent moved its own panel out of the way. */
  chatMoved: string;
  /** Notice text when the agent collapsed its own panel. */
  chatMinimised: string;
  /** The one control a run notice may carry. */
  undo: string;
  /** New-chat button (header + drawer). */
  newChat: string;
  /** Collapse button. */
  collapse: string;
  /** Expand affordance (the launcher, and the sidebar rail). */
  expand: string;
  /** Header control that grows the open panel; apart from {@link expand}, which opens it. */
  maximize: string;
  /** The same control while the panel is maximized. */
  restore: string;
  /**
   * The launcher's label while unread answers wait behind it. Token: `{count}`.
   * Replaces {@link expand} rather than appending to it, so a translation can
   * order the two parts as its language needs.
   */
  expandUnread: string;
  /** Built-in header theme toggle (light ⇄ dark). */
  toggleTheme: string;

  // ── Messages region ─────────────────────────────────────────────────────────
  /**
   * The greeting over an empty conversation under `placement="page"` (or an
   * `embedded` panel that opted in). Token: `{name}`, the `user-name` attribute.
   */
  greeting: string;
  /** The same greeting when the host named nobody: no `user-name`, or a blank one. */
  greetingNoName: string;
  /** `aria-label` of the scrolling message log. */
  conversation: string;
  /** The button offering to return to the foot of the transcript. */
  jumpToLatest: string;
  /** Announced when a turn starts. Screen-reader only; never rendered. */
  announceResponding: string;
  /** Announced when the answer has finished arriving. Screen-reader only. */
  announceAnswerReady: string;
  /** Announced when a card is waiting for the user's decision. Token: `{count}`. */
  announceAwaitingDecision: string;
  /** Announced when the user stopped the run. Screen-reader only. */
  announceStopped: string;
  /** Announced when the run failed. Screen-reader only. */
  announceFailed: string;
  /** `aria-label` of the "thinking" pending indicator, and the thoughts region's
   * header while the model is still reasoning. */
  thinking: string;
  /** The thoughts region's header once reasoning has ended, and its fallback
   * when the reasoning took under a second, too short to time. */
  thoughts: string;
  /** The thoughts region's header once reasoning has ended, naming how long it
   * took in whole seconds. Token: `{seconds}`. */
  thoughtFor: string;
  /** The muted note after a cancelled run. */
  stopped: string;
  /** Error shown when the stream drops without a terminal AG-UI event. */
  connectionLost: string;
  /** A failed run's bubble for the server's `error` code, or a code not below. */
  runErrorFailed: string;
  /** A failed run's bubble for the server's `timed_out` code. */
  runErrorTimedOut: string;
  /** A failed run's bubble for the server's `interrupted` code. */
  runErrorInterrupted: string;
  /** The offer on an `identifier_too_long` failure, which starts a new conversation. */
  runErrorNewChat: string;
  /** The usage line under a finished turn. Tokens: `{input}`, `{output}`. */
  usageBoth: string;
  /** The usage line when the server sent only input tokens. Token: `{input}`. */
  usageInput: string;
  /** The usage line when the server sent only output tokens. Token: `{output}`. */
  usageOutput: string;
  /**
   * Tool-result content (and card text) for a call that never produced a result
   * and that nobody refused: the run was stopped or failed first, the page
   * reloaded, or no tool here answered it. Sent to the agent, so it must not say
   * a person declined.
   */
  callNotFinished: string;
  /** Tool-result content when the user declines a confirmed action. */
  declinedAction: string;
  /** Tool-result content (and card text) when `confirmPredicate` threw, so the call was refused. */
  confirmCheckFailed: string;
  /** A navigating tool's card text while the page reloads. */
  navigating: string;
  /** Notice shown when the server replaced the conversation wholesale. */
  historyReplaced: string;
  /** Notice shown when a pushed chart could not be drawn and was removed. */
  chartUndrawable: string;
  /** Missing-placeholder skill hint. Tokens: `{title}`, `{fields}`. */
  skillNeeds: string;
  /** Notice shown when the agent condensed earlier turns. Token: `{count}`. */
  historyCompacted: string;
  /** Notice shown when the agent loads an agent skill. Token: `{name}`. */
  usingSkill: string;
  /** Caption under user messages delivered into a run while it was working. */
  enqueuedMessages: string;
  /** Summary of the sources list under an answer that cites them. Token: `{count}`. */
  citations: string;
  /** Names a cited document that has neither a title nor an id. */
  citationDocument: string;
  /** Notice in place of an MCP App's view, which this element cannot show. Token: `{uri}`. */
  mcpAppUnsupported: string;
  /** Label of the control that returns a fullscreen MCP App view inline. */
  mcpAppExitFullscreen: string;
  /** Prompt of the card that asks whether an MCP App view may send the message shown under it. */
  mcpAppConfirmMessage: string;
  /** Prompt of the card that asks whether an MCP App view may run a tool. Token: `{tool}`. */
  mcpAppConfirmTool: string;
  /** Notice shown on mount when the previous run never produced a response. */
  runInterrupted: string;
  /** Tool-result content (and card text) when the page moved mid-run. */
  pageMoved: string;
  /** Notice when Send ran while a file was still uploading. Token: `{n}`. */
  attachmentsStillUploading: string;
  /** Notice shown when a message was typed at an element with no `endpoint`. */
  notConnected: string;
  /** Composer hint when a run continuation was picked with an empty composer. */
  continueNeedsTurn: string;
  /** Composer hint when a run continuation was picked while a run is in flight. */
  continueWhileRunning: string;
  /**
   * Composer hint when a run continuation was picked while the stored
   * conversation is still loading.
   */
  continueWhileLoading: string;

  // ── Composer ────────────────────────────────────────────────────────────────
  /** `aria-label` of the message textarea. */
  message: string;
  /** Placeholder of the message textarea. */
  inputPlaceholder: string;
  /** Send button (idle composer). */
  send: string;
  /** Stop button (composer while a run is in flight). */
  stop: string;
  /** Attach-files button. */
  attachFiles: string;
  /** Mic button while idle (start recording). */
  recordVoice: string;
  /** Mic button while recording (stop + transcribe). */
  stopRecording: string;
  /** Mic button while the clip is being transcribed. */
  transcribing: string;
  /** Mic button fallback message when transcription fails. */
  transcriptionFailed: string;
  /**
   * Mic button message after a recording hit its length cap and stopped itself.
   * The clip is kept and transcribed, so this explains the silence rather than
   * reporting a loss. Token: `{n}` (the cap, in minutes).
   */
  recordingLimit: string;
  /** The place chip's tooltip while the place is sent. Token: `{label}`. */
  placeShared: string;
  /** The place chip's tooltip while the user withholds it. Token: `{label}`. */
  placeWithheld: string;
  /** The place toggle while the place is sent: pressing it withholds it. */
  placeStopSharing: string;
  /** The place toggle while the place is withheld: pressing it sends it again. */
  placeShareAgain: string;

  // ── Tool-call card ──────────────────────────────────────────────────────────
  /** Status pill while the call runs. */
  toolRunning: string;
  /** Status pill on a gated call the run deferred, waiting on a person. */
  toolDeferred: string;
  /** Status pill on success. */
  toolDone: string;
  /** Status pill on error. */
  toolError: string;
  /** Status pill on a declined call. */
  toolDeclined: string;
  /** Status pill on a call that ended without a result nobody refused. */
  toolInterrupted: string;
  /** Accessible label on the panel resize handle. */
  resizePanel: string;
  /** Note on a tool card whose call a human approved. */
  decisionApproved: string;
  /** Note on a tool card whose call a human declined. */
  decisionDeclined: string;
  /** Note on a tool card whose call a reviewer model approved, with no person asked. */
  answeredByReviewer: string;
  /** Note on a tool card whose call a routine's standing grant approved. */
  answeredByRoutine: string;
  /** Heading over a tool card's arguments region. */
  argumentsLabel: string;
  /** Heading over a tool card's result region when the call succeeded. */
  resultLabel: string;
  /** Heading over a tool card's result region when the call failed. */
  errorLabel: string;
  /** Heading over a tool card's result region when the call was declined. */
  declinedLabel: string;
  /** Heading over a tool card's result region when the call did not finish. */
  interruptedLabel: string;
  /** Label on the toggle that expands a tool card's body. */
  details: string;

  // ── Tool-step group ─────────────────────────────────────────────────────────
  // The row a run's consecutive calls fold into under the default
  // data-tool-display. A group of one shows that call's own label instead, so
  // the three labels are filled with 2 or more; the notes count from 1.
  /** The group's label while a step waits on the user. Token: `{count}` (steps). */
  toolGroupSteps: string;
  /** The group's label while a step runs. Token: `{count}` (steps). */
  toolGroupWorking: string;
  /** The group's label once every step has settled. Token: `{count}` (steps). */
  toolGroupWorked: string;
  /** Note on the group's row: steps waiting on the user. Token: `{count}`. */
  toolGroupWaiting: string;
  /** Note on the group's row: steps that failed. Token: `{count}`. */
  toolGroupFailed: string;
  /** Note on the group's row: steps that were declined. Token: `{count}`. */
  toolGroupDeclined: string;
  /**
   * Set after a step's label when an earlier step in its group has the same
   * one, so two "Fill field" steps read "Fill field" and "Fill field (2)".
   * Grouped mode only. Token: `{n}` (which occurrence, from 2).
   */
  toolStepRepeat: string;

  // ── Delegated sub-agent ─────────────────────────────────────────────────────
  /**
   * The delegation row's text before the server's own status line lands.
   *
   * A fallback, not a state: every announcement carries a pre-rendered `status`,
   * and this only shows if one arrives unusable. The row is the expander, so it
   * must never be blank.
   */
  subAgentWorking: string;
  /**
   * The row's line while a delegation is running. Token: `{agent}`.
   *
   * Worded here rather than on the wire, unlike the two step phases. The
   * protocol's `SUBAGENT_STARTED` carries the sub-agent's `name` and no rendered
   * status -- which is the better shape for a localised UI, and the reason this
   * string exists at all.
   */
  subAgentDelegatedTo: string;
  /** The row's line once a delegation completed. Token: `{agent}`. */
  subAgentFinished: string;
  /** The row's line once the parent cancelled a delegated task. Token: `{agent}`. */
  subAgentCancelled: string;
  /** The row's line for a task still open when the run ended. Token: `{agent}`. */
  subAgentUnfinished: string;
  /**
   * The row's line for a delegation that failed and named no agent.
   *
   * A fallback only: `SUBAGENT_ERROR` carries a required `message`, which the
   * server fills with the sub-agent's name and nothing else, and that text is
   * what the row shows. This covers a server that sent an empty one.
   */
  subAgentFailed: string;
  /** `aria-label` of the region holding the sub-agent's own tool calls. */
  subAgentSteps: string;
  /** The link from a card to the child session it started. Token: `{agent}`. */
  childSessionOpen: string;
  /** The same link while the child waits on the user. Token: `{agent}`. */
  childSessionNeedsYou: string;
  /** The breadcrumb from a child session back to its parent. Token: `{title}`. */
  parentThread: string;
  /** The breadcrumb when the thread list does not hold the parent's title. */
  parentThreadUnlisted: string;

  // ── Confirmation card ───────────────────────────────────────────────────────
  /** `aria-label` of the editable arguments field on an approval card. */
  approvalEditArgs: string;
  /** Shown when the edited arguments are not valid JSON. */
  approvalArgsInvalid: string;
  /** Shown when the edited arguments parse but are not a JSON object. */
  approvalArgsNotAnObject: string;
  /** `aria-label` of the follow-up suggestion chips row. */
  suggestions: string;
  /** `aria-label` of a message's action row. */
  messageActions: string;
  /** The offer that floats beside a selection in the transcript. */
  quoteSelection: string;
  /** Copy this message (button `title` / `aria-label`). Its confirmation and
   * failure text are the code block's `copied` / `copyFailed`, which say the
   * same thing about the same clipboard. */
  copyMessage: string;
  /** Ask for a different answer to the same question. */
  retryMessage: string;
  /** Rate this answer as good. */
  feedbackUp: string;
  /** Rate this answer as poor. */
  feedbackDown: string;
  /** `aria-label` of the inline confirmation card. */
  confirmAction: string;
  /** Waive confirmation for this tool for the rest of the session. Token: `{tool}`. */
  confirmAlways: string;
  /** Generic confirmation prompt when a tool has no `x-confirm`. Token: `{tool}`. */
  confirmRun: string;
  /** Confirm button. */
  confirm: string;
  /** Cancel button (confirmation + delete confirm). */
  cancel: string;

  // ── Approval card (server-side tool gate) ───────────────────────────────────
  /** `aria-label` of the inline server-side-tool approval card. */
  approveAction: string;
  /** Fallback approval prompt when the interrupt carries no message. */
  approvalPrompt: string;
  /** Approve button (runs the gated server-side tool). */
  approve: string;
  /** Deny button (declines the gated server-side tool). */
  deny: string;

  // ── Question card (the `ask_user` frontend tool) ────────────────────────────
  /** `aria-label` of the inline question card. */
  askUserAction: string;
  /** Radio label for the free-text "other" choice (when custom answers are allowed). */
  otherOption: string;
  /** Placeholder for the free-text answer field. */
  answerPlaceholder: string;
  /** Submit button for the question card. */
  submit: string;

  // ── Chat-history drawer ─────────────────────────────────────────────────────
  /** Drawer heading. */
  chats: string;
  /** Empty-state line when there are no threads. */
  noConversations: string;
  /** Rename row button (`title`). */
  rename: string;
  /** Rename row button `aria-label`. */
  renameConversation: string;
  /** Delete row button (`title`) + the inline-confirm action. */
  delete: string;
  /** Delete row button `aria-label`. */
  deleteConversation: string;
  /** Inline delete-confirm prompt. */
  deletePrompt: string;

  // ── Skill editor ────────────────────────────────────────────────────────────
  /** The header button and the list view's title. */
  skills: string;
  /** The row at the foot of the / palette that opens the editor. */
  manageSkills: string;
  /** The back arrow out of a full-panel view. */
  backToConversation: string;
  /** The list view's add button. */
  newSkill: string;
  /** The editor's title for a new skill. */
  newSkillTitle: string;
  /** The editor's title for an existing skill. */
  editSkillTitle: string;
  /** Empty-state heading. */
  noSkills: string;
  /** Empty-state explanation. Token: `{example}`. */
  noSkillsBody: string;
  /** Sends `/create-skill`: the agent drafts one onto an approval card. */
  draftSkill: string;
  /** Opens a blank editor. */
  writeSkill: string;
  /** Field label. */
  skillName: string;
  /** Under the name field. */
  skillNameHint: string;
  /** Field label. */
  skillDescription: string;
  /** Under the description field. */
  skillDescriptionHint: string;
  /** Field label. */
  skillBody: string;
  /** Under the instructions field. */
  skillBodyHint: string;
  /** The group of the two reach flags. */
  skillReach: string;
  /** The user-invocable flag. */
  skillInMenu: string;
  /** Under the user-invocable flag. */
  skillInMenuHint: string;
  /** The model-invocable flag. */
  skillAgentMayLoad: string;
  /** Under the model-invocable flag. */
  skillAgentMayLoadHint: string;
  /** Shown when both flags are off. */
  skillUnreachable: string;
  /** Tag on a skill that is off. */
  skillOff: string;
  /** Turns an off skill back on, in its list row. */
  turnOn: string;
  /** Turns a skill off, in the editor. */
  turnOff: string;
  /** Saves a new skill. */
  create: string;
  /** Saves an edited skill. */
  save: string;
  /** Status line after a save. Token: `{name}`. */
  skillSaved: string;
  /** Status line after turning a skill on. Token: `{name}`. */
  skillTurnedOn: string;
  /** Status line after turning a skill off. Token: `{name}`. */
  skillTurnedOff: string;
  /** Shown when the list will not load. */
  skillsUnavailable: string;
  /** Shown for a refused write whose answer carried no message. */
  skillSaveFailed: string;

  // ── Routines ────────────────────────────────────────────────────────────────
  /** The routines view's title and its header control. */
  routines: string;
  /** The list's add control. */
  newRoutine: string;
  /** The form's title for a new routine. */
  newRoutineTitle: string;
  /** The form's title for an existing routine. */
  editRoutineTitle: string;
  /** Empty-state heading. */
  noRoutines: string;
  /** Empty-state text. */
  noRoutinesBody: string;
  /** Shown when the list will not load. */
  routinesUnavailable: string;
  /** Shown for a refused write whose answer carried no message. */
  routineSaveFailed: string;
  /** Opens the form with the prompt taken from the conversation on screen. */
  makeRoutine: string;
  /** Name field label. */
  routineName: string;
  /** Prompt field label. */
  routinePrompt: string;
  /** Prompt field hint. */
  routinePromptHint: string;
  /** Schedule fieldset legend. */
  routineSchedule: string;
  /** The weekly schedule choice. */
  routineWeekly: string;
  /** The interval schedule choice. */
  routineInterval: string;
  /** Wall-time field label. */
  routineAt: string;
  /** Interval field label. */
  routineEvery: string;
  /** Timezone field label. */
  routineTimezone: string;
  /** Pre-approved tools fieldset legend. */
  routineTools: string;
  /** Pre-approved tools hint. */
  routineToolsHint: string;
  /** Shown when the mount offers no tool to grant. */
  routineNoTools: string;
  /** Tag on a destructive tool. */
  routineDestructive: string;
  /** Confirmation before granting a destructive tool. Token: `{name}`. */
  routineGrantDestructive: string;
  /** Confirms granting a destructive tool. */
  routineGrant: string;
  /** A schedule on all seven days. Token: `{time}`. */
  routineDaily: string;
  /** A schedule Monday to Friday. Token: `{time}`. */
  routineWeekdays: string;
  /** A schedule on some days. Tokens: `{days}`, `{time}`. */
  routineOnDays: string;
  /** An interval of one hour. */
  routineHourly: string;
  /** An interval of several hours. Token: `{n}`. */
  routineEveryHours: string;
  /** A schedule in a timezone not the viewer's. Tokens: `{schedule}`, `{zone}`. */
  routineInZone: string;
  /** The next firing. Token: `{time}`. */
  routineNext: string;
  /** In place of the next firing while paused. */
  routinePaused: string;
  /** Paused by the server, with its reason. Token: `{reason}`. */
  routinePausedBecause: string;
  /** Last result: never fired. */
  routineLastNever: string;
  /** Last result: the firing is still running or waiting. */
  routineLastPending: string;
  /** Last result: the firing lapsed before it ran. */
  routineLastLapsed: string;
  /** Last result: the firing finished. */
  routineLastFinished: string;
  /** Last result: it fired, and the queue no longer says how it went. */
  routineLastUnknown: string;
  /** Pauses a routine. */
  pause: string;
  /** Resumes a paused routine. */
  resume: string;
  /** Fires a routine now. */
  runNow: string;
  /** Status line after a save. Token: `{name}`. */
  routineSaved: string;
  /** Status line after pausing. Token: `{name}`. */
  routinePausedStatus: string;
  /** Status line after resuming. Token: `{name}`. */
  routineResumedStatus: string;
  /** Status line after Run now. Token: `{name}`. */
  routineStarted: string;
  /** Title of a thread row's routine badge. Token: `{name}`. */
  routineBadge: string;

  // ── Attachments ─────────────────────────────────────────────────────────────
  /** Oversize rejection. Token: `{size}`. */
  tooLarge: string;
  /** Disallowed-type rejection. */
  fileTypeNotAllowed: string;
  /** Generic upload failure (when the error carries no message). */
  uploadFailed: string;
  /** Retry-upload button (`title`). */
  retry: string;
  /** Retry-upload button `aria-label`. */
  retryUpload: string;
  /** Remove-attachment button (`title`). */
  remove: string;
  /** Remove-attachment button `aria-label`. */
  removeAttachment: string;

  // ── Code blocks ─────────────────────────────────────────────────────────────
  /** Label on a code block's copy button. */
  copyCode: string;
  /** Shown on the copy button after the code reached the clipboard. */
  copied: string;
  /** Shown when the clipboard was unavailable or refused the write. */
  copyFailed: string;

  // ── Checkpoint panel (continue a run) ───────────────────────────────────────
  /** Title of the checkpoint panel. */
  checkpoints: string;
  /** Empty state when no run can be continued. */
  noCheckpoints: string;
  /** Action: continue a run from its last checkpoint. */
  resumeRun: string;
  /** Action: branch a run without touching the original. */
  forkRun: string;
  /** Badge on a run that branched from another. */
  forkedRun: string;

  // ── Relative time (drawer rows) ─────────────────────────────────────────────
  /** Under a minute ago. */
  justNow: string;
  /** Minutes ago. Token: `{n}`. */
  minutesAgo: string;
  /** Hours ago. Token: `{n}`. */
  hoursAgo: string;
  /** Days ago. Token: `{n}`. */
  daysAgo: string;
  /** Weeks ago. Token: `{n}`. */
  weeksAgo: string;

  // ── Header ──────────────────────────────────────────────────────────────────
  /** The header button, and its menu, holding the controls the row has no room for. */
  moreControls: string;

  // ── Routine form fields ─────────────────────────────────────────────────────
  /** The accessible name of the routine time's hour select. */
  routineHour: string;
  /** The accessible name of the routine time's minute select. */
  routineMinute: string;

  /**
   * Note on the folded group's row: steps a reviewer model or a routine
   * approved with no one asked. Token: `{count}`.
   */
  toolGroupPreApproved: string;
}

/** The built-in English strings — the fallback every override merges over. */
export const DEFAULT_UI_STRINGS: UiStrings = {
  title: "Assistant",
  chatHistory: "Chat history",
  closeHistory: "Close history",
  searchConversations: "Search conversations",
  queued: "Waiting to send",
  removeQueued: 'Do not send "{text}"',
  noMatches: "No conversations match that.",
  threadsToday: "Today",
  threadsPreviousWeek: "Previous 7 days",
  threadsOlder: "Older",
  chatMoved: "Moved this panel out of the way",
  chatMinimised: "Minimised this panel",
  undo: "Undo",
  newChat: "New chat",
  collapse: "Collapse",
  expand: "Expand",
  maximize: "Maximize",
  restore: "Restore",
  expandUnread: "Expand — {count} unread",
  toggleTheme: "Toggle theme",
  copyCode: "Copy",
  copied: "Copied",
  copyFailed: "Copy failed",
  checkpoints: "Continue a run",
  noCheckpoints: "Nothing to continue yet.",
  resumeRun: "Resume",
  forkRun: "Fork",
  forkedRun: "branched",

  greeting: "Hello, {name}",
  greetingNoName: "Hello there",
  conversation: "Conversation",
  jumpToLatest: "Jump to latest",
  announceResponding: "Assistant is responding",
  announceAnswerReady: "Assistant answered",
  announceAwaitingDecision: "{count} action is waiting for your approval",
  announceStopped: "Response stopped",
  announceFailed: "The response failed",
  thinking: "Assistant is thinking…",
  thoughts: "Thoughts",
  thoughtFor: "Thought for {seconds}s",
  stopped: "⏹ Stopped",
  connectionLost: "Connection lost",
  runErrorFailed: "The response failed. Try again in a moment.",
  runErrorTimedOut: "The response took too long and was stopped.",
  runErrorInterrupted: "The response was interrupted before it finished.",
  runErrorNewChat: "Start a new conversation",
  usageBoth: "{input} in · {output} out tokens",
  usageInput: "{input} in tokens",
  usageOutput: "{output} out tokens",
  callNotFinished:
    "Not finished: the run ended or moved on before this tool call returned a result.",
  declinedAction: "User declined the action.",
  confirmCheckFailed:
    "Not run: the check that decides whether this action needs the user's confirmation failed.",
  navigating: "Navigating…",
  historyReplaced:
    "The server replaced this conversation's history. Reload to see the updated transcript.",
  chartUndrawable: "A chart could not be drawn from the data sent, so it was removed.",
  historyCompacted: "Earlier turns condensed to fit the context window ({count} removed)",
  usingSkill: "Using skill {name}",
  enqueuedMessages: "Added during the run",
  citations: "Sources ({count})",
  citationDocument: "Document",
  mcpAppUnsupported: "An app view can't be shown here: {uri}",
  mcpAppExitFullscreen: "Exit full screen",
  mcpAppConfirmMessage: "This app wants to send this message for you:",
  mcpAppConfirmTool: "This app wants to run “{tool}”",
  runInterrupted: "The previous response didn’t finish — the page changed before it arrived.",
  pageMoved:
    "The page changed since you last looked at it. Call read_page to see the current page, then retry.",
  attachmentsStillUploading:
    "{n} file still uploading — it was not sent with this message and is still attached.",
  notConnected: "This chat isn’t connected to an agent, so the message wasn’t sent.",
  continueNeedsTurn: "Type the next turn in the composer first, then pick a run to continue.",
  continueWhileRunning: "Wait for the current answer or stop it, then pick a run to continue.",
  continueWhileLoading: "Wait for the conversation to finish loading, then pick a run to continue.",
  skillNeeds: "“{title}” needs {fields} — fill it in below, then send.",

  message: "Message",
  inputPlaceholder: "Ask anything…",
  send: "Send",
  stop: "Stop",
  attachFiles: "Attach files",
  recordVoice: "Record voice",
  stopRecording: "Stop recording",
  transcribing: "Transcribing…",
  transcriptionFailed: "Transcription failed",
  recordingLimit: "Stopped at the {n}-minute limit — transcribing what was recorded.",
  placeShared: "The agent is told you are on {label}",
  placeWithheld: "{label} is not sent with your next message",
  placeStopSharing: "Stop sharing this page",
  placeShareAgain: "Share this page again",

  toolRunning: "running…",
  toolDeferred: "waiting for you",
  toolDone: "✓ done",
  toolError: "⚠ error",
  toolDeclined: "⊘ declined",
  toolInterrupted: "◌ not finished",
  resizePanel: "Resize the chat panel",
  decisionApproved: "approved by you",
  decisionDeclined: "declined by you",
  answeredByReviewer: "Approved by a reviewer model",
  answeredByRoutine: "Approved by a routine",
  argumentsLabel: "Arguments",
  resultLabel: "Result",
  errorLabel: "Error",
  declinedLabel: "Declined",
  interruptedLabel: "Not finished",
  details: "Details",

  toolGroupSteps: "{count} steps",
  toolGroupWorking: "Working through {count} steps",
  toolGroupWorked: "Worked through {count} steps",
  toolGroupWaiting: "{count} waiting for you",
  toolGroupFailed: "{count} failed",
  toolGroupDeclined: "{count} declined",
  toolStepRepeat: "({n})",

  subAgentWorking: "Working…",
  subAgentDelegatedTo: "Delegated to {agent}",
  subAgentFinished: "{agent} finished",
  subAgentCancelled: "{agent} was cancelled",
  subAgentUnfinished: "{agent} was still running when the run ended",
  subAgentFailed: "The sub-agent failed",
  subAgentSteps: "Steps the sub-agent took",
  childSessionOpen: "Open the {agent} task",
  childSessionNeedsYou: "The {agent} task needs you",
  parentThread: "From {title}",
  parentThreadUnlisted: "From the conversation that started this one",

  approvalEditArgs: "Edit the arguments before approving",
  approvalArgsInvalid: "That is not valid JSON, so nothing was sent.",
  approvalArgsNotAnObject: "Arguments have to be a JSON object.",
  suggestions: "Suggested follow-ups",
  messageActions: "Message actions",
  quoteSelection: "Quote",
  copyMessage: "Copy message",
  retryMessage: "Try again",
  feedbackUp: "Good answer",
  feedbackDown: "Poor answer",
  confirmAction: "Confirm action",
  confirmAlways: "Always allow",
  confirmRun: "Run “{tool}”?",
  confirm: "Confirm",
  cancel: "Cancel",

  approveAction: "Approve action",
  approvalPrompt: "Approve this action?",
  approve: "Approve",
  deny: "Deny",

  askUserAction: "Question",
  otherOption: "Other…",
  answerPlaceholder: "Type your answer…",
  submit: "Submit",

  chats: "Chats",
  noConversations: "No conversations yet.",
  rename: "Rename",
  renameConversation: "Rename conversation",
  delete: "Delete",
  deleteConversation: "Delete conversation",
  deletePrompt: "Delete?",

  skills: "Skills",
  manageSkills: "Manage skills",
  backToConversation: "Back to the conversation",
  newSkill: "New skill",
  newSkillTitle: "New skill",
  editSkillTitle: "Edit skill",
  noSkills: "No skills yet",
  noSkillsBody:
    "A skill is a set of instructions you or the agent can call up by name, like {example}.",
  draftSkill: "Draft one with the agent",
  writeSkill: "Write it yourself",
  skillName: "Name",
  skillNameHint: "Lowercase words joined by hyphens. It is what you type after /.",
  skillDescription: "Description",
  skillDescriptionHint:
    "The agent reads only this until it loads the skill, so say when to use it.",
  skillBody: "Instructions",
  skillBodyHint: "Markdown. A skill grants no tools: approvals still apply.",
  skillReach: "Who can use it",
  skillInMenu: "In the / menu",
  skillInMenuHint: "You pick it from the palette.",
  skillAgentMayLoad: "Agent may load it on its own",
  skillAgentMayLoadHint: "When the description matches the request.",
  skillUnreachable:
    "With both off nobody can reach this skill. Turn it off instead if that is the intent.",
  skillOff: "Off",
  turnOn: "Turn on",
  turnOff: "Turn off",
  create: "Create",
  save: "Save",
  skillSaved: "Saved /{name}",
  skillTurnedOn: "/{name} is on again",
  skillTurnedOff: "/{name} is off",
  skillsUnavailable: "Skills could not be loaded.",
  skillSaveFailed: "The skill could not be saved.",

  routines: "Routines",
  newRoutine: "New routine",
  newRoutineTitle: "New routine",
  editRoutineTitle: "Edit routine",
  noRoutines: "No routines yet",
  noRoutinesBody:
    "A routine asks the agent the same thing on a schedule. Each run is a conversation of its own.",
  routinesUnavailable: "Routines could not be loaded.",
  routineSaveFailed: "The routine could not be saved.",
  makeRoutine: "Make this a routine",
  routineName: "Name",
  routinePrompt: "Prompt",
  routinePromptHint: "What the agent is asked each time the routine runs.",
  routineSchedule: "When it runs",
  routineWeekly: "On days of the week",
  routineInterval: "Every few hours",
  routineAt: "At",
  routineEvery: "Every (hours)",
  routineTimezone: "Timezone",
  routineTools: "Pre-approved tools",
  routineToolsHint: "A run uses these without asking. Every other tool still waits for you.",
  routineNoTools: "This agent has no tools to pre-approve.",
  routineDestructive: "Destructive",
  routineGrantDestructive:
    "{name} is destructive: every run may use it without asking you. Grant it anyway?",
  routineGrant: "Grant",
  routineDaily: "Every day at {time}",
  routineWeekdays: "Weekdays at {time}",
  routineOnDays: "{days} at {time}",
  routineHourly: "Every hour",
  routineEveryHours: "Every {n} hours",
  routineInZone: "{schedule} ({zone})",
  routineNext: "Next {time}",
  routinePaused: "Paused",
  routinePausedBecause: "Paused: {reason}",
  routineLastNever: "Not run yet",
  routineLastPending: "Running",
  routineLastLapsed: "Lapsed",
  routineLastFinished: "Finished",
  routineLastUnknown: "Ran",
  pause: "Pause",
  resume: "Resume",
  runNow: "Run now",
  routineSaved: "Saved {name}",
  routinePausedStatus: "{name} is paused",
  routineResumedStatus: "{name} is on again",
  routineStarted: "{name} is running",
  routineBadge: "Run by the routine {name}",

  tooLarge: "Too large (max {size})",
  fileTypeNotAllowed: "File type not allowed",
  uploadFailed: "upload failed",
  retry: "Retry",
  retryUpload: "Retry upload",
  remove: "Remove",
  removeAttachment: "Remove attachment",

  justNow: "just now",
  minutesAgo: "{n}m ago",
  hoursAgo: "{n}h ago",
  daysAgo: "{n}d ago",
  weeksAgo: "{n}w ago",

  moreControls: "More",

  routineHour: "Hour",
  routineMinute: "Minute",

  toolGroupPreApproved: "{count} pre-approved",
};

/**
 * Merge a partial set of overrides over {@link DEFAULT_UI_STRINGS}, yielding a
 * complete {@link UiStrings}. Keys whose override is `undefined` keep the
 * default (so a `data-strings` JSON with only a few keys — or a property carrying
 * explicit `undefined` — leaves the rest English).
 */
export function mergeUiStrings(overrides: Partial<UiStrings>): UiStrings {
  const merged: UiStrings = { ...DEFAULT_UI_STRINGS };
  for (const key of Object.keys(overrides) as (keyof UiStrings)[]) {
    const value = overrides[key];
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}
