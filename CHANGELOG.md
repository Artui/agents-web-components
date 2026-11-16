# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The A2UI input components: `Button`, `TextField`, `CheckBox` and `ChoicePicker`, with the
  basic catalog's names and properties.** `Button` draws its child inside a native button, runs
  its `action` once per click, and is disabled while any `@checks` rule fails, with the rule's
  message shown under it; `variant` (`default`, `primary`, `borderless`) is stated on the root.
  The other three bind `value` both ways: a keystroke, toggle or choice
  writes the data model at once, creating the path, and a model change redraws the control
  without moving a user's caret or focus. `TextField` draws `shortText`, `longText` (a
  textarea), `number` (a text input with a decimal keyboard, since the value is a string) and
  `obscured`; `ChoicePicker` draws radios for `mutuallyExclusive` and checkboxes for
  `multipleSelection`, as a list or as `chips`, with a search box when `filterable`. A failing
  `@checks` rule shows its message under the control and marks it `aria-invalid` for an error,
  once the user has edited or left it, so an empty form opens quiet. On a surface that is not
  live every control is disabled, writes nothing and dispatches nothing. Parts:
  `a2ui-button-control`, `a2ui-button-message`, `a2ui-text-field-label`,
  `a2ui-text-field-input`, `a2ui-text-field-message`, `a2ui-check-box-label`,
  `a2ui-check-box-input`, `a2ui-check-box-text`, `a2ui-check-box-message`,
  `a2ui-choice-picker-label`, `a2ui-choice-picker-filter`, `a2ui-choice-picker-options`,
  `a2ui-choice-picker-option` (`data-selected` when chosen), `a2ui-choice-picker-input`,
  `a2ui-choice-picker-option-text`, `a2ui-choice-picker-message` (`data-severity`).

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

[Unreleased]: https://github.com/Artui/agents-web-components/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Artui/agents-web-components/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Artui/agents-web-components/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Artui/agents-web-components/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/Artui/agents-web-components/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Artui/agents-web-components/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Artui/agents-web-components/compare/v0.0.0...v0.1.0
