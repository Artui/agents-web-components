# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Make this a routine is an item in the header's More menu.** With `data-routines-url` set and
  a prompt on screen (also a restored one), More lists it after the other controls, and the row
  keeps at most four beside More as before; choosing it opens the routines
  view on the pre-filled New routine form, as the list's button does. It leaves with New chat,
  and `makeRoutine()` and the list-foot button are unchanged. It reuses the `makeRoutine`
  string, so a host that localised it needs no new key.

### Fixed

- **`<ag-ui-inbox variant="list">` shows a focus ring when focus falls back to the list.** Answering the last row hands focus to the panel (the list is hidden at zero rows), which drew only the browser's default ring, outside its edge; it now draws the rows' ring, inset so a sidebar does not clip it.

## [0.12.0] — 2026-11-24

### Added

- **`<ag-ui-agents>` answers `getCapabilities()` from the mounted entry.** django-ag-ui 0.88.1
  lists each directory entry with `capabilities`, AG-UI's `AgentCapabilities` in its camelCase
  keys (`humanInTheLoop`, `multimodal`, `reasoning`, `execution.maxExecutionTime`, ...). The
  provider's `getCapabilities()` resolves the entry the chat is on, or `undefined` before a
  listing and for an entry from an older server. An undeclared key is absent, never `false`, so
  a host hides a control only on a declaration it can read (no `humanInTheLoop`, or
  `reasoning.supported === false`), and keeps every control for an entry that declares nothing.
  Declarations are informative: the chat still draws every event the stream sends. Opt-in: a
  host that does not call `getCapabilities()` sees no change. The provider also forwards an
  entry's `routines_url` to its chat as `data-routines-url`, removed where the entry has `null`
  or no key; no opt-in.
- **An agents home recipe: the README's "An agents home" section and `demo/agents/`.** The
  inbox list, `<ag-ui-threads>` and `<ag-ui-chat placement="page">` under one `<ag-ui-agents>`,
  each piece also imported alone (`/agents/alone.html?piece=inbox|threads|chat`) in the demo.
  No new element or API. No opt-in: nothing in the package changed.
- **Routines: a caller's scheduled prompts, from django-ag-ui's routines editor. Opt-in: a
  standalone host sets `data-routines-url`; under `<ag-ui-agents>`, a mount whose entry serves
  routines gets it with no host change, since the provider passes the entry's `routines_url` on.** A
  Routines button in the header opens them in the full-panel view: each row says its schedule in
  words, its next run and its last result, with Pause or Resume and Run now. A routine is created
  and edited in a form whose pre-approved tools come from the server's `grantable` list; a
  destructive one is marked and granting it asks first. Make this a routine (`makeRoutine()`)
  starts one from the conversation's prompts, and a thread a routine started is badged with its
  name in the thread list (`ThreadMeta.routine`, read off the threads index). The form's
  weekdays are toggle pills, filled in the accent when chosen, each a checkbox for the keyboard
  and screen readers; a host restyles them through `::part(routine-day)`.

### Fixed

- **`<ag-ui-inbox>` answers a row in place on a page served over plain HTTP.** Approve and
  Deny minted the resume's run id with `crypto.randomUUID`, which a browser offers only in a
  secure context, so on a LAN address or any non-HTTPS origin other than localhost the click
  threw and nothing was sent. The id is now built on `crypto.getRandomValues`, as the A2UI
  actions' run ids already were, which keeps the protocol packages out of the inbox bundle.
  No opt-in: a host that already answers in place gets the fix.
- **`<ag-ui-inbox>`'s badge names its popup, the popover is a labelled dialog, and focus
  leaving it closes it.** The badge carries `aria-haspopup="dialog"`, and the popover panel is
  `role="dialog"` named by its heading (as a list, a `role="group"` with the same name). Tab
  past the last row, or Shift+Tab past the badge, used to leave the popover open behind the
  focus. It now closes, and focus stays where the key sent it. Escape still closes and hands
  focus back to the badge, and a press outside still closes it. No opt-in.
- **`<ag-ui-inbox variant="list">` keeps keyboard focus in the list when the focused row
  leaves.** A row answered in place, answered elsewhere, or no longer waiting on the next
  refresh used to drop focus to the page. Focus now moves to the row that took its place,
  else the previous row, else the list itself (its panel, focusable by script only and named
  like the list). The badge variant is unchanged: focus goes back to the badge. No opt-in.
- **The header's More menu shows its rows' names whole.** A name such as "Toggle theme" was
  clipped at the baseline, since the row kept the header button's line height of one font
  size under the clip that ellipsises a long name. The name now has a line height of its own.
  No opt-in.

## [0.11.0] — 2026-11-23

### Added

- **`<ag-ui-inbox>`, what waits on the user across agents, in a new `./inbox` entry (and
  `./inbox/bundle`). Opt-in: a host imports it and calls `defineInbox()`.** It reads the inbox
  of an `<ag-ui-agents>` provider, which keeps it fresh by ETag polling or SSE as
  `data-inbox-transport` says, and lists each conversation whose run is `waiting` on an
  interrupt: its title, its agent, and what it waits on (an approval, marked destructive unless
  the server says otherwise, a question, or any other parked call). `variant="badge"` (the
  default) is a navbar button counting those conversations that opens the list in a popover
  (Escape and a press outside close it, the arrow keys move between rows); `variant="list"` is
  the list alone, for a home page's "needs you" section. Bound by `agents="<provider id>"`, so a
  badge outside the provider reads it, else to the nearest provider, or by the `provider`
  property. Picking a row fires the cancelable `ag-ui-inbox-select` (`INBOX_SELECT_EVENT`,
  `InboxSelectDetail`, `{ agentId, threadId }`), then calls the provider's
  `openThread(agentId, threadId)`. A row whose every interrupt is a non-destructive approval
  is answered in place with Approve or Deny, which POST the agent's `resume/<run_id>/` as a
  detached run and fire `ag-ui-inbox-answer` (`INBOX_ANSWER_EVENT`, `InboxAnswerDetail`); this
  needs django-ag-ui 0.88.0, whose waiting rows name the parked run (`run_id`, on a mount with
  a `step_store`), and only for an agent the provider's directory lists. On an older server every
  row only opens its conversation. The badge's popover opens over a floating `<ag-ui-chat>` (one
  above `--ag-ui-z-index`), keeps keyboard focus through a redraw, and closes on Escape from the
  badge too. Themed by the
  shared `--ag-ui-*` tokens; parts `badge`, `icon`, `count`, `panel`, `heading`, `list`, `row`,
  `row-button`, `mark`, `agent`, `summary`, `destructive`, `actions`, `approve-button`,
  `deny-button`, `answer-error`, `empty`; strings `InboxStrings`.
- **`InboxRow.runId`** on `<ag-ui-agents>`' inbox: a waiting row's parked run, when the server
  names it (`run_id`, django-ag-ui 0.88.0).

### Changed

- **The header fits any number of controls: the optional ones move into a More menu. No opt-in.**
  While the row fits, every control stays in it. When it does not, or when it would hold more
  than five, the theme toggle, Skills, checkpoints and History move into a More menu (the
  three dots), in that order, until at most four remain beside More. New chat, Maximize and
  Collapse never move. A control in the menu is the same `<button>`, with the same class, `part`
  and `icon-*` slot, so `::part(history-button)` and a host's
  `.header-btn--history` `.click()` keep working; it gains `role="menuitem"` there and shows its
  name beside its glyph, in the panel's ink rather than the header's. New parts `more-button` and
  `header-menu`, new string `moreControls`. The menu takes Enter, Space and the arrows on More,
  the arrows, Home and End inside it, and Escape back to More. A header with the theme toggle and
  `data-runs-url` on (six controls) now shows the theme toggle and checkpoints in the menu even
  on a wide panel; a host's own row of four or five is unchanged.

## [0.10.0] — 2026-11-23

### Added

- **Child sessions: the card that started one links to the child's thread, and still does after a
  reload. No opt-in.** A `start_session` call's result (django-spec-agents 0.25.0's
  `ChildSessionReceipt`, `{ agent_id, thread_id, run_id, note }`) is read on the live result and
  on a restore alike, so the link is drawn from what persists rather than from `SUBAGENT_*`
  events, which a child session never sends. A refusal draws no link. When the thread list the
  chat holds shows the child `waiting`, the link reads "needs you" (`childSessionNeedsYou`) and
  still only opens the child: the parent never draws the child's approval. With
  `data-threads-url` on django-ag-ui 0.86.0+, `ThreadMeta` gains `parent` (`ThreadParent`,
  `{ threadId, scope }`); the chat shows a breadcrumb back to the parent (`parentThread`, or
  `parentThreadUnlisted` when the list does not hold it) while a child is on screen, and the
  history drawer nests each child under its parent's row (parts `drawer-row-child`,
  `drawer-children`) in the parent's date group, an orphan or a child a filter matched alone at
  the top level. A link or the breadcrumb dispatches the new cancelable `ag-ui-open-thread`
  (`OPEN_THREAD_EVENT`, detail `OpenThreadDetail`, `{ agentId, threadId }`) and then opens the
  thread in place unless a listener calls `preventDefault()`: a host whose child agent lives on
  another mount takes the event and opens it there. New parts `child-session-link`,
  `parent-breadcrumb`, `parent-breadcrumb-link`; new strings `childSessionOpen`,
  `childSessionNeedsYou`, `parentThread`, `parentThreadUnlisted`. Without a list held (a reload
  straight onto a child under a remote store), the breadcrumb and the needs-you wording wait for
  the first drawer open, switch or `data-thread-status` tick. Deleting the parent hides the
  breadcrumb at once, and it stays hidden over the lists that follow. The link is underlined at
  rest, in the accent (the danger colour when the child needs you), since the default accent is
  close to the body colour. A child opened before its first answer, which the held list shows
  `running` or `waiting`, draws no "the previous response didn't finish" notice.

- **`<ag-ui-agents>`, a headless provider for several agents; a host opts in by wrapping its
  elements in one, and a lone `<ag-ui-chat>` is unchanged.** It reads django-ag-ui 0.87.0's
  agents directory (`data-agents-url`, with the ETag; `agents`, `refresh()`,
  `ag-ui-agents-change`) and watches its inbox of every agent's threads (`data-inbox-url`, by
  ETag polling or, with `data-inbox-transport="stream"`, SSE; `inbox`, `ag-ui-inbox-change`, rows
  carrying `agentId`). It mounts its chat (the `<ag-ui-chat>` inside it, or `chat`) on the entry
  `agent` names, the first by default: the chat is taken out, given the entry's URLs, and put
  back, so its connect-time attributes stay connect-time and no warning is raised; a run in flight
  is cancelled as by any remount. Each agent's conversation is stored under the entry id, so
  switching back restores its thread; a host's own store, a `RemoteConversationStore` it made
  included, is left alone, and a second chat on the same entry gets a throwaway namespace and a
  warning, as a second chat on one namespace does. `RemoteConversationStore` gains a read-only
  `local`, the store it keeps the thread pointer in. `ag-ui-agent-change`
  fires on each switch, and `openThread(agentId, threadId)` opens an inbox row. Exported from the
  root entry with `defineAgents`, `AgUiAgents`, the `AGENTS_TAG`, `AGENTS_CHANGE_EVENT`,
  `INBOX_CHANGE_EVENT` and `AGENT_CHANGE_EVENT` constants, and the `AgentEntry`, `InboxRow`,
  `InboxServerRow`, `InboxTransport`, `AgentsChat` and detail types.
- **`<ag-ui-agents>` takes a child session on another agent. No opt-in beyond the provider.** It
  listens to its chat's cancelable `ag-ui-open-thread`: when `detail.agentId` names a listed
  entry other than the one mounted, it calls `preventDefault()` and `openThread(agentId,
  threadId)`, so a child-session link or the parent breadcrumb switches agent and shows the
  thread. The same agent, an unlisted one and a `null` `agentId` leave the chat to open in place,
  as does a request a listener on the chat prevented first. A host that already handles
  `ag-ui-open-thread` for the same job can drop its listener.
- **`<ag-ui-threads>` binds through a provider.** Without `for` or `chat`, it binds to the chat of
  the `<ag-ui-agents>` named by its new `agents="<id>"` attribute, else the nearest one around it,
  and lists again when the provider switches agents. `for` keeps working and wins when both are
  present. Nothing changes for a list with `for`.

- **Open threads (tabs) on `<ag-ui-chat>`, a model with no rendering, behind a host opt-in: the
  first `openTab` call starts tracking; until then nothing is kept, written or announced, so a
  host that never calls it sees no change.** `tabs` is the open threads in order, each
  `{ threadId, title }` (`ThreadTab`); `openTab(threadId, title?)` opens one without showing it
  (the first also opens the thread on screen), and `closeTab(threadId)` closes one while the thread
  stays in history, unlike `deleteThread`, which closes the tab too. Once tracking, showing a thread
  (`switchThread`, `newChat`, the drawer, a child-session link, the parent breadcrumb) opens it, and closing the thread on screen shows its
  neighbour, else a new chat. The set persists per browser tab in `sessionStorage` under the
  conversation's namespace, so it survives a reload, and a `user-key` handover drops it. Every
  change fires `ag-ui-tabs` (`TABS_EVENT`, `TabsDetail { tabs, reason }`).

### Fixed

- **A chat put back on another namespace no longer writes the run it left there. No opt-in.**
  An `<ag-ui-agents>` switch, or an `id` or `endpoint` changed while the chat was out of the
  document, cancels the run in flight on the way out, and that run's last save arrived after the
  chat was back: read against the new store, it wrote the thread it left, title and messages,
  into the next agent's history (a thread parked on an approval did this on every switch). A
  client built before such a remount now writes nothing, as one built before a `user-key`
  handover already did; what it had saved before the switch stays where it was.

## [0.9.0] — 2026-11-21

### Added

- **Thread status and unread from the server, behind a host opt-in for live updates:
  `data-thread-status="poll"` or `"stream"`.** Without the attribute nothing is watched, and a
  server without a run store changes nothing. With `data-threads-url` on a django-ag-ui 0.84.0+
  mount that has a run store, every listing now reads each row's `status` (`idle`, `running`,
  `waiting` or `failed`), the failure `reason` and the `interrupts` a waiting run parked onto
  `ThreadMeta` (`status`, `reason`, `interrupts`), and derives `unread` from `last_read_at`: a
  thread is unread when it changed after it was last read and is not running, and a thread never
  read is not. Reading a thread posts `<threads-url><id>/read/`, only to a server whose listing
  carried `status`. Listings send `If-None-Match` and reuse the rows a `304` confirms. With the
  attribute, the chat watches the list while connected: `poll` asks again every five seconds,
  `stream` follows the server's event stream through `fetch` (the live headers and credentials),
  reconnects naming the last frame, and polls from then on if the server answers with JSON (a WSGI
  deployment). Each list is handed on in the new `ag-ui-threads-change` event (detail
  `ThreadsChangeDetail`, `{ threads }`) and counted into `unread`. `ClientConversationStore` gains
  the optional `watchThreads(listener, transport)`. `<ag-ui-threads>` marks each row the store
  marks, waiting before failed before running before unread, as `data-status` on the row and a
  `mark` part (`mark-running`, `mark-waiting`, `mark-failed`, `mark-unread`) named by the new
  `ThreadsStrings` `running`, `waiting`, `failed` and `unread`, and draws each
  `ag-ui-threads-change` list without listing again. The history drawer draws no marks yet.

- **A thread restored while its run waits on an approval offers the approval.** With
  `data-threads-url` on a django-ag-ui 0.84.0+ mount with a run store, restoring a thread the list
  names as waiting on approvals (`metadata.kind == "approval"`) leaves the parked call open,
  shows the approval card on it as a live run does, and resumes the run with the person's
  answer, where the call used to be closed as not finished. No opt-in: a server without a run
  store lists no interrupts. A `question` or `external` interrupt is not offered. Stop, or leaving
  the thread, while the person decides keeps the run parked. `ClientConversationStore` gains the
  optional `waitingInterrupts(threadId)`, and `AgUiClient` gains `answerParked(interrupts)`.

- **A detached start on a queued mount is followed.** A django-ag-ui 0.82.0+ mount with a
  `firing_queue=` answers a start that asks to detach with `200 {"thread_id", "run_id"}` and runs
  it on a worker; the element's agent now exchanges that answer for the thread's run log
  (`events/?after=0`) and streams the run as it would have streamed the start, where it used to
  read the JSON as an empty stream and show "Connection lost". The replay's opening
  `MESSAGES_SNAPSHOT` (the stored conversation, without the turn just sent) is not applied, so
  the turn stays in the history and in the next request. Under the existing opt-in
  (`data-detach-runs` with `data-threads-url`); nothing new to opt into. `createHttpAgent` takes
  `getEventsUrl`, a live source of `eventsUrl` read per replay, which wins over `eventsUrl`; the
  element now passes both. **A host factory that overrides `eventsUrl`** (as
  `createHttpAgent({ ...options, eventsUrl })`) has that override ignored: override
  `getEventsUrl` instead, or drop it from the options. A factory that passes the options on
  unchanged needs nothing.

### Fixed

- **A turn parked behind a joined run no longer fails on the server's release lag.** django-ag-ui
  logs a run's `RUN_FINISHED` before it lets go of the thread, so the parked turn sent the moment
  the joined replay ended could meet a second `409` naming that same run and be shown as an
  error. It is now asked once more after a quarter second; a second refusal is still the error.
  No opt-in.
- **`data-threads-url` set after the element connected now reaches the run routes.** The agent
  took its run log's URL when it was built, so the next reattach went to the old URL, or nowhere
  when the attribute had been missing. A replay now reads the attribute when it is made, as a
  cancel already did. The thread list and its store still read it only while connecting, and
  the late-change warning now says which half moved. No opt-in.
- **An answer read as it lands is now recorded when its run settles.** `markRead` was called at the
  answer's end, which a django-ag-ui server reaches before it saves the conversation, so the read
  could land first and the thread list as unread on the next listing. It is now called once the
  run has settled, still once per answer, and for an answer seen landing even if the panel closed
  before the run ended. A store of your own sees the same single call, a little later. No opt-in.

## [0.8.0] — 2026-11-21

### Added

- **A run can outlive its connection, behind a host opt-in: `data-detach-runs` (property
  `detachRuns`).** It needs `data-threads-url` and a django-ag-ui 0.82.0+ mount with a run store
  and `RUN_TIMEOUT_SECONDS`, served over ASGI to an authenticated user; without
  `data-threads-url` it does nothing, and without the opt-in nothing changes. With it, every
  request's `forwardedProps` carries `detach: true` (every round of a turn, frontend-tool rounds
  included), so a thread switch, New chat, `reload()`, a `user-key` change or the element leaving
  the page only aborts the request and the run finishes on the server with no cancel recorded.
  Restoring a thread (a pick, the first load, re-insertion) asks the server once whether its run is
  still going, with a JSON `GET <threads-url><id>/events/?after=0&limit=1`, and on `"running"`
  joins it by replaying `events/?after=0` through the element's own agent, which is now a
  `DetachedHttpAgent` (an `HttpAgent` overriding `connect`, through the same fetch wrapper,
  headers and credentials). The replay's opening `MESSAGES_SNAPSHOT` redraws the transcript, and
  `running` / `data-running` stay set until the joined run ends; a host's `sendMessage()` made
  while that restore was in flight waits for the joined run, then goes out ahead of any turn the
  composer parked. **Stop changes under the opt-in:** Stop, Escape and deleting the thread on
  screen first post `<threads-url><id>/cancel/` (a `404` is quiet), then abort as before. A send
  the server refuses with `409` because another run holds the thread joins that run and queues the
  turn, attachments included, sent once that run ends. `HttpAgentOptions` gains `eventsUrl`;
  `AgUiClientConfig` gains `detach`; `AgUiClient` gains `reattach()` and `canReattach`;
  `AgUiClientHandlers.onMessagesSnapshot` takes a second argument, `authoritative`, and the
  optional `onTurnRefused(content, attachments)`. A factory agent that does not override
  `connect` is restored from the store alone. Not covered yet: a `firing_queue=` mount's JSON
  answer to a detached start.

### Changed

- **A live MCP Apps view no longer sends a message or calls a tool unseen.** Each `ui/message`
  and `tools/call` from a live view now waits for the user in a confirmation card under the
  view's frame (pinned under it while fullscreen): the card names the tool and shows its
  arguments, or shows the exact text the message would send. Confirm runs it as before; Cancel
  answers the view with a JSON-RPC error, `-32000` "Message sending denied" or "Tool call
  denied". A view that called a tool on load now shows a card first, and its result waits for
  the answer. Requests are asked one card at a time, in order; a card still waiting when the
  view asks to be torn down, leaves or reloads in a new window (a host moving the element does
  it) is declined without answering the new window, and one allowed after the view went stored
  is refused. The card reuses the inline confirmation card's styles and its `confirm` part
  (plus a new `mcp-app-consent` part), so a host's `::part(confirm)` rules now style it too; it
  takes no focus. Two new strings keys word it, `mcpAppConfirmTool` ("This app wants to run
  “{tool}”") and `mcpAppConfirmMessage` ("This app wants to send this message for you:"). `ui/open-link` is unchanged. **No opt-in, and no
  opt-out:** a host that calls `registerMcpApps` gets the card on upgrade, and a view that
  called tools without the user now needs a click per call. A `tools/call` whose `arguments`
  is not an object is sent with `{}`.

## [0.7.0] — 2026-11-20

### Added

- **A tool call card marks a call that a reviewer model or a routine approved.** No interrupt is
  raised for such a call, so the mark goes on the card itself. It is read from
  `metadata.answered_by` on a live `TOOL_CALL_RESULT` and on a stored tool message, so it returns
  after a reload. A `reviewer:<model>` value sets `data-answered-by="reviewer"` and a
  `routine:<id>` value sets `data-answered-by="routine"`. Each also adds a note in the card's head
  with the new part `tool-card-answered-by`, worded by the new strings keys `answeredByReviewer`
  ("Approved by a reviewer model") and `answeredByRoutine` ("Approved by a routine"). Any other
  prefix, and a result without the key, render exactly as before. The mark is display only. No
  opt-in: the mark appears wherever django-ag-ui 0.81.0 or later stamps `answered_by`.
  `AgUiClientHandlers.onToolResult` takes the raw value as a fourth argument, `answeredBy`.
- **`./mcp-apps` shows a live view fullscreen when it asks.** `ui/request-display-mode` with
  `fullscreen` fixes the view's box over the page without moving its frame, so the view keeps its
  state rather than reloading; Escape, an "Exit full screen" control (focused on entry, string
  `mcpAppExitFullscreen`) or a request for `inline` returns it to the transcript at the height it
  had. Each switch, by the view or the user, sends `ui/notifications/host-context-changed` with
  `displayMode` and `containerDimensions` (`width` and `height` while fullscreen). **The host
  context's `availableDisplayModes` now includes `fullscreen`** for a live view (a stored or
  torn-down view still gets `["inline"]` and its requests are answered `inline`), and `pip` is
  answered with the current mode, as the MCP Apps result allows. One view per registration is
  fullscreen at a time. The overlay is a manual popover in the top layer, so it covers the viewport
  above the host page's layers whatever `--ag-ui-z-index` is, in every placement; a browser without
  popover (Firefox before 125) gets a fixed box inside the host's stacking context. No opt-in: a host
  already calling `registerMcpApps` gets it, and a host that re-vendors this release advertises
  the new mode to its views.
- **A skill editor for a caller's own stored skills.** Opt in with `data-skill-editor-url`, set to
  django-ag-ui's `SkillEditorView` mount (0.83.0 or later); without it nothing changes. Under
  `data-slash-commands` the `/` palette gains a Manage skills row at its foot (alone under a bare
  `/` when no skill matches; unmatched text closes the palette, so Enter still sends it), and
  `data-skill-editor-button` puts a Skills button in the header (off by default, since with every
  header control on the row then needs about 262px). Without either, `openSkillEditor()` is the
  entry point. The editor opens as a full-panel view in place of the transcript and composer, with a
  back arrow, a list, an empty state, and a form whose two switches read "In the / menu" and "Agent
  may load it on its own"; History, Checkpoints and New chat close it first. "Draft one with the
  agent" sends `/create-skill`. A refused save shows the server's message above the form:
  django-ag-ui 0.83.0 names no field, and a refusal that does name one shows under that field.
  Writes go through `chat.request`, so each carries the live `headers` and `getHeaders`: a host on
  django-ag-ui 0.83.0, which checks CSRF by default, must return its CSRF header from `getHeaders`.
  The palette's catalog refetches after an editor write, on a user-key change, and on the
  `ag_ui.skills_changed` CUSTOM event, which is still dispatched as `ag-ui-custom`. New: the methods
  `openSkillEditor()` and `closeSkillEditor()`, the types `EditorSkill` and `EditorSkillDraft`, the
  parts `skills-button`, `skill-manage`, `panel-view`, `panel-view-bar`, `panel-view-title`,
  `panel-view-body`, `panel-view-footer`, `back-button`, `skill-rows`, `skill-row`, `skill-empty`,
  `skill-form` and `new-skill-button`, and the strings `skills`, `manageSkills`,
  `backToConversation`, `newSkill`, `newSkillTitle`, `editSkillTitle`, `noSkills`, `noSkillsBody`,
  `draftSkill`, `writeSkill`, `skillName`, `skillNameHint`, `skillDescription`,
  `skillDescriptionHint`, `skillBody`, `skillBodyHint`, `skillReach`, `skillInMenu`,
  `skillInMenuHint`, `skillAgentMayLoad`, `skillAgentMayLoadHint`, `skillUnreachable`, `skillOff`,
  `turnOn`, `turnOff`, `create`, `save`, `skillSaved`, `skillTurnedOn`, `skillTurnedOff`,
  `skillsUnavailable` and `skillSaveFailed`.

### Fixed

- **A coded non-2xx answer from the mcp-apps route now reaches the view with its code and message.**
  django-ag-ui answers an unauthenticated call 401 and a refused one 403 (and a throttled one 429)
  with `{"error": {"code", "message"}}`; the element threw a bare status error for them, which the
  bridge sent on as a generic -32000. It now reads the body of a non-2xx reply and rejects with the
  route's code and message (-32001, -32006, -32005). A body that is not that envelope keeps the
  status error and -32000.
- **A checkpoint row keeps Resume and Fork on one line.** In a narrow row Fork dropped onto its own
  line under Resume, because each button was its own wrapping item. The pair now sits in one
  `part="checkpoint-actions"` wrapper that wraps as a unit and rides the trailing edge. No host
  opt-in; a host that styled `::part(checkpoint-row)` as a flat flex row sees the pair as one child.
- **A view that navigates its frame inside the sandbox proxy is torn down, as a `srcdoc` view
  already was.** With `sandboxProxyUrl` set the view's frame lives inside the proxy page, whose own
  frame does not reload, so the navigation went unseen and the view stayed mounted. The shipped
  proxy page now removes its inner frame on the view's second load and tells the host with
  `ui/notifications/sandbox-view-navigated` (host-private: ext-apps 2.1.0 has no message for it);
  the host closes the view to the notice and warns, as for `srcdoc`. Nothing to opt in to, but a
  host serving its own copy of `sandbox-proxy.html` re-copies it from this release; a third-party
  proxy that never sends the notification keeps the old behaviour.

## [0.6.0] — 2026-11-18

### Added

- **The package ships an MCP Apps sandbox proxy page, `./mcp-apps/sandbox-proxy.html`
  (`dist/sandbox-proxy.html`).** One static file with its script inline, for a host to serve on a
  second origin and name as `sandboxProxyUrl`. It answers the frame's
  `ui/notifications/sandbox-proxy-ready` and `sandbox-resource-ready`, puts the view in an inner
  `sandbox="allow-scripts"` frame (whatever `sandbox` the message asks) with the view's CSP as the
  first `<meta>` of its head, takes only the first resource and only from its parent, and relays
  messages both ways. Opt-in: a host that wants a proxy serves this file, with no CSP header of its
  own, and sets `sandboxProxyUrl`; a host without one is unchanged.
- **A new `./threads` entry: `<ag-ui-threads>`, the conversation list for a host's own bar or
  rail.** `defineThreads()` registers it; `for="<chat id>"` (looked up in the list's own root) or
  the `chat` property, which wins over `for`, binds it to an `<ag-ui-chat>`. `variant="list"` (the
  default) draws rows, `variant="pills"` a strip that scrolls sideways; both delete a conversation
  behind an inline confirm. A row picked fires a cancelable `ag-ui-threads-select` (`{threadId}`)
  and then calls `switchThread`, which cancels a run in flight as the built-in list does. It draws
  no run marks (running, waiting, failed, unread) yet: those wait for a store that reports run
  status. Parts `list`, `row`, `row-active`, `row-button`, `delete`, `confirm`, `empty`; the chat's
  tokens apply, in the light or dark half the page's own `color-scheme` picks. `refresh()` re-lists;
  `strings` translates. `./threads/bundle` is the same entry as a fourth vendored file, inlining
  none of the element; the main entries and bundle are unchanged. A host opts in by importing
  `./threads` and placing the element.
- **`./mcp-apps` draws a view's sandboxed frame instead of the notice.** Once the view first scrolls
  into sight it reads its HTML through `resources/read` on `url` (once per server and URI for the
  page; a failed read draws the notice, warns, and is read again next time) and frames it. The
  route is read as django-ag-ui 0.80.0's answers: `200` with `{"result": ...}`, the MCP result,
  or `{"error": {"code", "message"}}` for a call it cannot relay. **A host serving its own route
  wraps its answer in `result`**; a bare result object now fails the read. Without
  `sandboxProxyUrl` the frame is `srcdoc` with `sandbox="allow-scripts"` and the view's CSP as the
  first `<meta>` of its `<head>`: `_meta.ui.csp`'s domains, or the MCP Apps restrictive default,
  plus `font-src 'self' data:`, `object-src 'none'`, `frame-src` and `base-uri`, with any declared
  domain holding whitespace, `;`, a quote or a comma dropped. With it, the frame is the proxy on its
  own origin (`allow-scripts allow-same-origin`, the cleaned CSP also on the URL as `?csp=`), sent
  the view in `ui/notifications/sandbox-resource-ready` once it says
  `ui/notifications/sandbox-proxy-ready`. A view that navigates its frame is torn down to the
  notice; one the page moves reloads and boots again, and one that leaves the document, in sight or
  not (scrolled away, under `display: none`, or with the chat it is in), has its bridge stopped and
  is framed again from the cache if it returns. A view closed to the notice is not framed again. No `allow` permissions are granted.
  **A host that called `registerMcpApps` on 0.5.0 now shows live frames with nothing to opt into,
  but a `srcdoc` frame inherits the host page's CSP:** under a strict `script-src` the view stays
  blank, so such a host sets `sandboxProxyUrl` and lets its own `frame-src` reach the proxy's
  origin. `registerMcpApps` now throws for a `sandboxProxyUrl` on the page's own origin, where
  `allow-same-origin` would leave the view unsandboxed.
- **`./mcp-apps` speaks the host's end of the MCP Apps bridge**, so a view initialises, shows its
  tool's input and result, and acts. JSON-RPC over `postMessage` (2026-01-26), read only from the
  view's own frame. `ui/initialize` is answered with `hostContext`: the chat's scheme as `theme`,
  its tokens resolved in that scheme as `styles.variables` under the MCP Apps names, `locale`,
  `displayMode: "inline"`, `availableDisplayModes: ["inline"]`, the frame's width with a
  `maxHeight` of 640 as `containerDimensions`, and `platform: "web"`. Only after
  `ui/notifications/initialized` does the view get `tool-input` then `tool-result`, and from then
  `host-context-changed` when the `theme` attribute, the system scheme or the frame's width changes.
  `size-changed` sets the frame's height, at most 640px. `tools/call` goes to the route with the
  view's `serverId`, and a route's coded `error` reaches the view with its own code (`-32000` for
  any other failure); `ui/message` (an array of content blocks or one block) is sent as the user's
  next message; `ui/open-link` opens an `http(s)` URL in a `noopener` tab; all three are refused
  while the view is drawn from a stored conversation, and once it has asked to be torn down. `ui/request-display-mode` is answered
  `inline`; a view that sends `ui/notifications/request-teardown` is sent `ui/resource-teardown`
  and closed to the notice; any other request is answered `-32601`. Tested against
  django-spec-mcp's own view bridge. **A host that called `registerMcpApps` gets this with nothing
  to opt into.**
- **`<ag-ui-chat>` reports its theme to a separate entry**: the read-only `colorScheme` (`"light"`
  or `"dark"`, the scheme drawn now) and `locale` (the nearest `lang`, looked for past any shadow
  root the element is in, else the browser's), a `tokenValues(names)` method resolving custom
  properties as the panel computes them, and an `ag-ui-theme` event (`THEME_EVENT`, `{ scheme }`)
  when the `theme` attribute changes.

### Fixed

- **The checkpoint panel ("Continue a run") is opaque.** It took its fill from the answer tint,
  which the default, soft and ledger themes leave transparent, so the transcript showed through the
  open panel and the "branched" badge drew no pill. It is now the chat's own colour with the
  theme's tint over it; classic and code look as before. Its rows are also 4px apart now: they sat
  in a list the panel's gap did not reach, so each row's surface ran into the next. A host opts in to
  nothing.

- **Starter prompts sit against the composer without a greeting.** With `data-greeting="off"` on a
  page, or in any panel placement, the empty region (the starter chips and any host `slot="empty"`
  content) was centred in the transcript, a screen-height from the field it starts. It now rests at
  the foot, directly over the composer, so slotted empty content moves down with it. The greeting
  layout and the phone breakpoint are unchanged.
- **A redraw of an `mcp-apps` activity reuses only a view node `./mcp-apps` drew**, passing the
  redraw's `live` to it; any other previous node, such as the built-in notice, is replaced.

## [0.5.0] — 2026-11-17

### Added

- **`chat.request(url, init?)`, `fetch` as the element authenticates.** It sends `headers` and
  `getHeaders()` under `init.headers` (which win per key) and `credentials` unless `init` names its
  own, and reports a destination outside `trustedOrigins` as the element's own requests do. Nothing
  changes for a host that does not call it.
- **`chat.uiStrings`, the string table the element draws with**, read-only: the English defaults,
  then `data-strings`, then `strings`, resolved on connect. A separate entry draws its text from
  it, so a host localised through `data-strings` keeps its words. Nothing to opt into.
- **A new `./mcp-apps` entry, `registerMcpApps(chat, {url, sandboxProxyUrl?})`.** It registers the
  `mcp-apps` activity renderer over the element's built-in notice. Activity content is pydantic-ai's
  `{resourceUri, toolInput, result, serverId?, serverHash?}`; `url` is the host's `mcp-apps/` route,
  reached through `chat.request`, so a view's requests carry the element's headers and cookie
  policy. An activity naming no server still draws the notice: give the pydantic-ai `MCPToolset` an
  `id`. `./mcp-apps/bundle` is the same entry as a third vendored file, which inlines none of the
  element. A host opts in by importing `./mcp-apps`; the main entries and bundle are unchanged.
  **In this release every view still draws the notice:** the sandboxed frame and the view's bridge
  are not in it, so registering the entry changes nothing a user sees yet. It fixes the seam the
  frame and the bridge build on.

## [0.4.0] — 2026-11-16

### Added

- **A2UI 1.0 surfaces, drawn from data, in a new `./a2ui` entry.** `registerA2ui(chat, {onError?})`
  registers the `a2ui-surface` activity renderer that `@ag-ui/a2ui-middleware` 0.0.16 and
  django-ag-ui 0.78.0's `render_a2ui` send, posts this renderer's catalog (the basic catalog's
  twelve components and fourteen functions, `a2ui/v1/catalog.json`, about 12,000 characters) as the
  context entry the server builds its `render_a2ui` tool from, and starts a run with
  `forwardedProps.a2uiAction` for each action, under the user turn id and text django-ag-ui stores
  for it, numbers spelled as Python's `json.dumps` spells them. Bindings, templates, `@checks` and
  `@accessibility` follow the spec; a surface replayed from a stored conversation is drawn inert. A
  component or a catalog it does not hold is drawn as a notice (part `a2ui-notice`); surfaces carry
  parts `a2ui-surface` and `a2ui-<kebab-case type>`.
  `./a2ui/bundle` is the same entry as a second vendored file (about 146 KB, with its own `marked`
  and DOMPurify for Text), which inlines none of the element. The main entries and the main bundle
  carry no A2UI code, so a host opts in by importing `./a2ui`.
- **A2UI errors go to the host, not the agent.** Neither the middleware nor django-ag-ui carries
  A2UI's `error` message back yet, so a live surface hands each one, in the spec's
  `{version: "1.0", error: {code, surfaceId, message, path?}}` shape, to `onError` (default
  `console.warn`) once per draw of the surface (a redraw with new content reports again), draws a
  notice, and starts no run (owner ruling).
- **The A2UI renderer draws the basic catalog's display components**: Text, Image, Icon, Row,
  Column, List, Card and Divider, with the basic catalog v1's names and properties. Text is
  markdown through the transcript's sanitiser, so an agent's HTML, handlers, links to `javascript:`
  and images never reach the DOM. Image loads only `http:`, `https:` and `data:image/...` URLs, or
  a relative path on the page's own host, and is hidden with no source otherwise. Icon draws the
  catalog's 59 names as Material Symbols glyphs (Apache-2.0) and the `{svgPath}` form in a 24-unit
  box; an unknown name draws an empty glyph. List draws a template once per item of its array.
  Each component is styled through the theme's tokens and found by its part (`a2ui-text`,
  `a2ui-image`, `a2ui-icon`, `a2ui-row`, `a2ui-column`, `a2ui-list`, `a2ui-card`, `a2ui-divider`),
  with its variant on a `data-` attribute. A host opts in through the `./a2ui` entry.
- **The A2UI input components: `Button`, `TextField`, `CheckBox` and `ChoicePicker`, with the basic
  catalog's names and properties.** `Button` draws its child inside a native button, runs its
  `action` once per click, and is disabled while any `@checks` rule fails, with the rule's message
  shown under it; `variant` (`default`, `primary`, `borderless`) is stated on the root. An
  `@accessibility` label or description lands on the native button, input or checkbox, and on a
  `ChoicePicker`'s fieldset. The other three bind `value` both ways: a keystroke, toggle or choice
  writes the data model at once, creating the path, and a model change redraws the control without
  moving a user's caret or focus. `TextField` draws `shortText`, `longText` (a textarea), `number`
  (a text input with a decimal keyboard, since the value is a string) and `obscured`;
  `ChoicePicker` draws radios for `mutuallyExclusive` and checkboxes for `multipleSelection`, as a
  list or as `chips`, with a search box when `filterable`. A failing `@checks` rule shows its
  message under the control and marks it `aria-invalid` for an error, once the user has edited or
  left it, so an empty form opens quiet. On a surface that is not live every control is disabled,
  writes nothing and dispatches nothing. Parts: `a2ui-button-control`, `a2ui-button-message`,
  `a2ui-text-field-label`, `a2ui-text-field-input`, `a2ui-text-field-message`,
  `a2ui-check-box-label`, `a2ui-check-box-input`, `a2ui-check-box-text`, `a2ui-check-box-message`,
  `a2ui-choice-picker-label`, `a2ui-choice-picker-filter`, `a2ui-choice-picker-options`,
  `a2ui-choice-picker-option` (`data-selected` when chosen), `a2ui-choice-picker-input`,
  `a2ui-choice-picker-option-text`, `a2ui-choice-picker-message` (`data-severity`).
- **The A2UI basic catalog's 14 functions run.** `required`, `regex`, `length`, `numeric` and
  `email` return a `ValidationResult`; `formatString` interpolates `${path}` and `${fn(name:
  value)}` (with `\${` as a literal); `formatNumber`, `formatCurrency`, `formatDate` and
  `pluralize` go through `Intl` in the page's locale; `and`, `or` and `not` coerce by the spec's
  table. `regex` follows the A2UI dialect: a pattern it forbids (backreferences, lookbehind,
  nested or alternating unbounded repeats) or cannot compile is `valid: false`, never a throw.
  `openUrl` runs only from a user gesture and only for a URL the http(s) allowlist approves or a
  relative path on the page's own host, opened with `noopener,noreferrer`. `pluralize` picks `zero`
  for 0 when it is given.

## [0.3.0] — 2026-11-15

### Added

- **The activity types pydantic-ai's own AG-UI adapter sends are drawn, or deliberately not,
  out of the box.** `pydantic_ai_enqueued_messages` (messages a run took in through
  `RunContext.enqueue`) draws each user message's text as a user bubble, as text and never as
  HTML, captioned "Added during the run" (`enqueuedMessages`; parts `enqueued-messages`,
  `enqueued-messages-note`). `mcp-apps` draws a run notice naming the app view's `resourceUri`,
  which this element cannot show yet (`mcpAppUnsupported`, token `{uri}`; part
  `run-notice-mcp-app`). `pydantic_ai_compaction` and the three deltas
  (`pydantic_ai_tool_availability_delta`, `pydantic_ai_model_settings_delta`,
  `pydantic_ai_capability_load_delta`) draw nothing and log nothing. None of the six shows in
  `unhandledActivityTypes` any more, so that list keeps meaning "a name nobody here knows".
  django-ag-ui's own `compaction` notice is unchanged. A host that registered its own renderer
  for any of them keeps it, whether it registered before or after the element connected. No
  opt-in.
- **An activity renderer can say "nothing to draw, by design".** Returning an empty
  `DocumentFragment` draws nothing, logs nothing, keeps the type out of `unhandledActivityTypes`
  and takes away whatever that message id drew before. `null` still means the content could not
  be drawn, and still warns. A host opts in by returning one.
- **An activity renderer is told what it drew last, and whether the draw is live.** `render`
  takes a second argument, an `ActivityRenderContext` (`{ messageId, previous, live }`, exported
  from the package root). Returning `previous`, updated in place, keeps the node where it is
  across a redraw of the same message id, so a field the user is typing into keeps its value and
  its focus; returning a new node replaces it, and `null` removes it, as before. `live` is `true`
  for a draw from the run in flight and `false` for one replayed from a stored conversation, and a
  surface drawn with `live: false` must be inert, since acting on it would re-send a stale action
  on every thread load. One-argument renderers, the built-in chart among them, draw exactly as
  before. A host opts in by reading the second argument.
- **`chat.run({ forwardedProps, runId?, message? })` starts a run for an action.** The first
  request carries `forwardedProps` as `RunAgentInput.forwardedProps` and `runId`, when given,
  unchanged; the frontend-tool and approval rounds after it carry neither. `message`
  (`{ id, content }`) is the user turn the server builds from the props: it is drawn and announced
  by `ag-ui-submit`, is not in the first request's messages, and joins the conversation under its
  id when that request's `RUN_STARTED` arrives, after the posted history and before the reply, so
  later requests post it and the store saves it. It refuses, waits behind a restore and resolves
  as `sendMessage` does. Retry answers for the action: refused before `RUN_STARTED`, Retry and
  `retryLastTurn()` send the same request again, `forwardedProps` and `runId` included, with no
  second bubble; once `RUN_STARTED` arrives, or after a Stop, Retry is withdrawn and
  `retryLastTurn()` resolves `false` rather than truncating to the turn before, until the next send
  or continuation. `AgUiClient.run(request, onStarted?)`, whose callback hears the first round's
  `RUN_STARTED`, and the `AgUiRunRequest` type are the client half. A host opts in by calling it.
- **`chat.registerContext(provider)` adds entries to every run's context** after what
  `getContext` returns, in registration order, for the conversation's runs and checkpoint
  continuations alike; it returns the function that removes them. A host opts in by calling it;
  `getContext` is unchanged.

### Fixed

- **An activity renderer that returns a non-empty `DocumentFragment` can now be redrawn under
  the same message id.** The registry kept the fragment, which is empty once appended, so the
  next draw threw `previous.replaceWith is not a function`. It now keeps a wrapper element
  (`display: contents`, so layout is unchanged) holding the fragment's children, and that wrapper
  is `previous` on the next draw. A fragment draw leaves one extra element in the transcript. No
  opt-in.

## [0.2.1] — 2026-11-15

### Fixed

- **A run the server cancelled now ends as a stop, not a finish.** A `RUN_FINISHED` whose
  outcome is `cancelled` (pydantic-ai's AG-UI adapter, which django-ag-ui streams through, sends
  it when the agent cancels its own run or a run deadline passes) was read as a finished turn:
  it ran the tool calls it streamed, drew the `show-usage` line and announced an answer. It now
  takes the Stop path: the Stopped note, no usage line, its tool calls not run and settled as
  not finished, `onCancelled()` on `AgUiClientHandlers`, and `ag-ui-run-finished` reporting
  `outcome: "stopped"`. A host that counts completions from that event no longer counts these.
  A host opts in to nothing.
- **A run POST refused with a coded JSON body now shows the coded failure.** django-ag-ui
  refuses an over-long thread or run id before the stream opens, with a 400 whose body is
  `{"error": <message>, "code": "identifier_too_long"}`; the bubble showed `HTTP 400: <body>`
  and no new-conversation offer, so 0.2.0's offer reached only the in-stream `RUN_ERROR`. A
  non-2xx body that is JSON with a string `code` now takes the same path as a `RUN_ERROR` with
  that code: the code's string, or for `identifier_too_long` the server's `error` message and
  the offer, and `onError` receives the code in `RunErrorInfo`. A body with no `code`, or one
  not sent as `application/json`, keeps `HTTP <status>: <body>`. A host opts in to nothing.

## [0.2.0] — 2026-11-15

### Added

- **An opt-in token-usage line under a finished turn: `show-usage`.** With the attribute set and
  the server sending usage on `RUN_FINISHED` (django-ag-ui's `include_usage`), the turn ends with a
  muted line such as `1,234 in · 567 out tokens` (part `usage-line`), summing `inputTokens` and
  `outputTokens` over every usage entry of every round in the turn. A side no entry carried is
  left out; a turn with no usage, a failed one and one the user stops draw nothing, and the line is not
  stored, so a restored conversation has none. The templates are `usageBoth`, `usageInput` and
  `usageOutput`. A host opts in by setting `show-usage`. `AgUiClientHandlers` gains an optional
  `onUsage(usage)`.

### Changed

- **A failed run's bubble says what happened, by the `RUN_ERROR` event's `code`.** `timed_out`
  and `interrupted` each get their own sentence (`runErrorTimedOut`, `runErrorInterrupted` in the
  strings table); `error` and a code this release does not know show `runErrorFailed`; an event
  with no code (any other AG-UI server, or django-ag-ui before 0.76.0) keeps showing the server's
  message, as before. `identifier_too_long` shows the server's own message, which names the field
  and the limit, and an offer under the action row (`runErrorNewChat`, part `run-error-offer`)
  that starts a new conversation as New chat does, since a new conversation's fresh ids are what
  recover from it. A run POST answered with a non-2xx status still shows the client's own
  `HTTP <status>: <body>` text, now pinned by a test. Every host opts in to nothing; a host that
  showed the server's words on purpose (django-ag-ui's `tool_failure.include_detail`) now sees the
  strings for a coded failure instead.
  `AgUiClientHandlers.onError` gains an optional second argument, `RunErrorInfo`, present for a
  `RUN_ERROR` and carrying its code; a host table written for the one-argument form still fits.

## [0.1.2] — 2026-11-14

### Changed

- **A last pass of internal simplification: the toggle event goes through the element's one emit
  helper, the longest internal comment blocks in the panel placement are condensed, and two groups
  of tests are parametrised.** No behaviour changes. A host opts in to nothing.

### Fixed

- **The header theme toggle's glyph follows the system scheme under `theme="auto"`.** When the
  operating system switched between light and dark, the panel redrew but the toggle kept the old
  glyph until the next click; it now redraws as the `prefers-color-scheme` query changes, and stops
  listening when the element is removed. A host rule that changes the element's `color-scheme` at
  runtime is still not seen, and the README says so. A host opts in to nothing.

## [0.1.1] — 2026-11-14

### Changed

- **Releases are published from CI by npm trusted publishing, with provenance.** 0.1.0 was
  published from a workstation and carries none; this release has no code changes and exists to
  put a signed build on the registry. A host opts in to nothing.

## [0.1.0] — 2026-11-14

First release of `@artooi/agents-web-components`, the successor of `@artooi/ag-ui-web-component`.
The `ag-ui-` tags, events, parts, slots and `--ag-ui-*` properties keep their names; the README's
move page walks a host over. Each entry below says whether a host opts in.

### Changed

- **The package is `@artooi/agents-web-components`**, and the vendored bundle is
  `dist/agents-web-components.bundle.js`. Opt-in: install the new package, remove the old one, and
  never load both on a page.
- **The element moves to its own entry, `@artooi/agents-web-components/chat`**, which exports
  `AgUiChat` and `defineChat`; the package root keeps everything else, and the
  library build splits the modules the two share so a page holds one instance of each.
  `defineChat()` now throws, naming the tag, when another class already holds the `<ag-ui-chat>`
  tag. The package declares `sideEffects: false`, `./bundle` gains its `types`, and the vendored
  bundle still carries every export and defines nothing at import. Opt-in: a host imports
  `AgUiChat` and `defineChat` from `./chat`; bundle hosts rename the file and the call.
- **Storage keys start with `agents-web-components`** (was `ag-ui-chat`): collapsed state, theme,
  panel size, launcher and dock position, and the built-in conversation store all move to the new
  root. A host opts in to nothing; the first deploy forgets the open thread and the saved
  preferences once. A host that reads these keys itself must read the new root.
- **A refused `sessionStorage` write warns once per owner rather than once per page.** One element
  can now warn once for its conversation store, once for its preferences (layout, theme and the
  collapsed state), and once more after a `user-key` change rebuilds its store; each
  `SessionStorageStore.adopt` call warns at most once. Opt-in: none.
- **The markdown sanitiser is recorded as an immutable memo**, and the two copies of the
  quote-offer placement in the transcript are folded into one. No behaviour changes: sanitised
  output, attributes, parts and positions are as before.

### Removed

- **`defineAgUiChat`**, renamed `defineChat` and moved to `./chat`. Opt-in: a host renames the
  import and the call.
- **`AgUiClient.annotatedMessages`**: the getter returned `messages` itself. Opt-in: a host that
  read `annotatedMessages` reads `messages`.
- **`createStateHookTools` and `StateHook`**, the deprecated aliases of `createPageStateTools` and
  `PageState`. Opt-in: a host still importing either name switches to the new one; behaviour is
  identical.
- **`AgUiChat.registerStateHook`**, the deprecated alias of `registerPageState`, which takes the
  same binding and does the same thing. Opt-in: a host still calling it renames the call.
- **The `noResult` string** in `UiStrings`: nothing drew it since a call that never returned is
  answered with `callNotFinished`. A string table that sets it no longer type-checks; delete the
  entry.
- **The adoption of storage keys written without a namespace.** The conversation store moved
  them into its own namespace on construction, and the collapsed and theme preferences fell back
  to the global key on read. Under the new storage root there is nothing to move, and an element
  that gains an `id` or endpoint after it first wrote keys starts fresh. Opt-in: none, bar the
  one-time reset under Storage keys above.

### Fixed

- **The theme toggle's glyph follows a `theme` written from outside**: setting or removing `theme`
  after the header is drawn (a host's own picker or saved choice) now redraws the toggle, which
  kept offering the moon under `theme="dark"`. Only the toggle's own click redrew it before. A host
  opts in to nothing.

[Unreleased]: https://github.com/Artui/agents-web-components/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/Artui/agents-web-components/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/Artui/agents-web-components/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/Artui/agents-web-components/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/Artui/agents-web-components/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/Artui/agents-web-components/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Artui/agents-web-components/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Artui/agents-web-components/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Artui/agents-web-components/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Artui/agents-web-components/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Artui/agents-web-components/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Artui/agents-web-components/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Artui/agents-web-components/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/Artui/agents-web-components/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Artui/agents-web-components/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Artui/agents-web-components/compare/v0.0.0...v0.1.0
