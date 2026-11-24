# Public API surface

Everything below is re-exported from the package root ([`src/index.ts`](https://github.com/Artui/agents-web-components/blob/main/src/index.ts)), except
`AgUiChat` and `defineChat`, which are the `./chat` entry. The
vendored bundle ([`src/bundle.ts`](https://github.com/Artui/agents-web-components/blob/main/src/bundle.ts)) carries both. Internal modules import from leaf
paths.

## Element & registration

| Export | Kind | Summary |
| --- | --- | --- |
| `AgUiChat` | class | The `<ag-ui-chat>` Custom Element (`./chat`). |
| `defineChat()` | function | Register the element (`./chat`); a no-op if it is already registered, and throws if another class holds the tag. |
| `MessageRole` | type | Role of a rendered chat message. |
| `SubmitDetail` | type | `detail` shape of the submit event. |
| `ThreadDetail` | type | `detail` shape of the `ag-ui-thread` event (`{ threadId, previousThreadId, reason }`). |
| `OpenThreadDetail` | type | `detail` shape of the `ag-ui-open-thread` event (`{ agentId, threadId }`). |
| `ToggleDetail` | type | `detail` shape of the `ag-ui-toggle` event (`{ collapsed }`). |
| `MaximizeDetail` | type | `detail` shape of the `ag-ui-maximize` event (`{ maximized }`). |
| `BarHeightDetail` | type | `detail` shape of the `ag-ui-bar-height` event (`{ height }`). |
| `DockWidthDetail` | type | `detail` shape of the `ag-ui-dock-width` event (`{ width, side }`). |
| `ThreadTitleDetail` | type | `detail` shape of the `ag-ui-thread-title` event (`{ threadId, title }`). |
| `UnreadDetail` | type | `detail` shape of the `ag-ui-unread` event (`{ unread, threadIds }`). |
| `ThreadsChangeDetail` | type | `detail` shape of the `ag-ui-threads-change` event (`{ threads }`). |
| `AgUiAgents` | class | The headless `<ag-ui-agents>` provider: the agents directory, the inbox, and the chat it mounts on an entry. See [Several agents under one provider](agents.md#several-agents-under-one-provider). |
| `defineAgents()` | function | Register `<ag-ui-agents>`; a no-op if it is already registered, and throws if another class holds the tag. |
| `AgentEntry` | type | One directory entry: `id`, `name`, `description`, `endpoint` and one URL per route, `null` where the mount serves none (`routines_url` may be absent from an older server), and `capabilities`, optional: what the mount declares of AG-UI's `AgentCapabilities`. |
| `InboxRow` | type | An inbox row: a `ThreadMeta` plus `agentId`. |
| `InboxServerRow` | type | An inbox row as the server lists it: a thread row plus `agent_id`. |
| `InboxTransport` | type | How the inbox is watched: `poll` or `stream`. |
| `AgentsChat` | type | The part of `<ag-ui-chat>` the provider drives. |
| `AgentsChangeDetail` | type | `detail` shape of the `ag-ui-agents-change` event (`{ agents }`). |
| `InboxChangeDetail` | type | `detail` shape of the `ag-ui-inbox-change` event (`{ threads }`). |
| `AgentChangeDetail` | type | `detail` shape of the `ag-ui-agent-change` event (`{ agent }`). |
| `AttachmentsDetail` | type | `detail` shape of the `ag-ui-attachments` event (`{ attachments, pending }`). |
| `StateDetail` | type | `detail` shape of the `ag-ui-state` event (`{ state }`). |

## AG-UI client & agent

| Export | Kind | Summary |
| --- | --- | --- |
| `AgUiClient` | class | Orchestration layer over an AG-UI `AbstractAgent`. |
| `AgUiRunRequest` | type | What `run` takes, on the element and on `AgUiClient` (`{ forwardedProps, runId?, message? }`). |
| `AgUiClientConfig` / `AgUiClientHandlers` / `AgUiRunInputs` | type | Client config, lifecycle handlers, per-run input providers. |
| `AgUiToolCall` / `ToolExecution` / `ExecuteTool` | type | Tool-call shape, execution result, executor signature. |
| `AgUiMessageIds` | type | Which message `AgUiClientHandlers.onTextEnd` completed: its `messageId`, and the `runId` its `RUN_STARTED` named. |
| `ToolOutcome` | type | The `TOOL_OUTCOME` values as a union. |
| `toolStatusFromOutcome` | function | Map a wire outcome to the card status it settles into; anything absent or unrecognised is a success. |
| `ConnectionLostError` | class | Raised (→ `onError`) when a run's stream closes with no terminal AG-UI event. |
| `RunErrorInfo` | type | The second argument `AgUiClientHandlers.onError` gets for a `RUN_ERROR`, or for a non-2xx run POST whose JSON body carries a string `code`: that `code`. For such a body, the message is the body's `error` when it is a string. |
| `createHttpAgent(options)` | function | Default agent factory (wraps `HttpAgent`). |
| `AgentFactory` / `HttpAgentOptions` | type | Factory signature and its options. |
| `ResolveInterrupts` | type | Resolver for server-side-tool approval interrupts (one decision per interrupt). |
| `InterruptResponse` | type | One interrupt's answer: `resolved` (with an optional payload) or `cancelled`. |

## Tools & flags

| Export | Kind | Summary |
| --- | --- | --- |
| `ClientToolRegistry` | class | Per-element tool registry. |
| `ClientTool` | type | A frontend tool declaration. |
| `isDestructive(parameters)` | function | Read the `x-destructive` flag. |
| `isNavigates(parameters)` | function | Read the `x-navigates` flag. |
| `createPageActionTools(enabled, resolveTarget)` | function | Build the opt-in `scroll_to` / `drag_and_drop` tools. |
| `PAGE_ACTIONS` | const | The page-action opt-in tokens (`scroll` / `drag`). |
| `createChatSurfaceTools(surface)` | function | Build the opt-in `read_chat_surface` / `move_chat` / `minimise_chat` / `restore_chat` tools, which let the agent move the panel it is speaking from. |
| `ChatSurface` | type | The narrow port those tools drive — `describeSurface` / `moveTo` / `setCollapsed`. The element satisfies it. |
| `ChatSurfaceReport` | type | What `describeSurface()` answers: placement, collapsed, collapseTo, collapsible, movable, draggable, fullBleed, and the panel's box against the viewport it sits in. |
| `ChatCorner` | type | `"top-left"` / `"top-right"` / `"bottom-left"` / `"bottom-right"` — the argument to `moveTo`. |
| `CHAT_CORNERS` | const | Those four, as a list. |
| `isChatCorner(value)` | function | Whether a string names one of them. |
| `ResolvePageTarget` | type | `(target) => HTMLElement \| null` — the page-target resolver. |
| `X_DESTRUCTIVE_KEY` / `X_NAVIGATES_KEY` | const | The JSON-Schema extension keys. |
| `parseToolCatalog(data)` | function | Parse a fetched `data-tools-url` catalog into a `Record<string, ToolCatalogEntry>` — whole entries, not bare summaries, so a caller can reach `description` too. Malformed input yields an empty map rather than throwing. |
| `ToolCatalogEntry` | type | One row of that catalog. |
| `prettifyToolName(name)` | function | Last fallback of the tool-card label chain (`delete_record` reads as *Delete record*). |

## Host seams

| Export | Kind | Summary |
| --- | --- | --- |
| `createRouteTools(...)` | function | Build the built-in `route.*` tools. |
| `Route` / `RouteMap` | type | Navigable-route shapes. |
| `RouteWithParams` | type | A route resolved with `:param` path segments + leftover query params. |
| `createPageMapContext(...)` | function | Build the per-run `page_map` context entry. |
| `PageMap` | type | The compact page-surface shape. |
| `Place` | type | Where the user is: what `getPlace` returns and the chip draws. |
| `createPageStateTools(binding)` | function | Build `read_<name>` / `set_<name>` tools. |
| `PageState` | type | A page-state binding declaration. |
| `Skill` | type | A launchable prompt (chip / `/`-command). |
| `EditorSkill` | type | A stored skill as the skill editor endpoint serves it. |
| `EditorSkillDraft` | type | What the skill editor sends to create or replace one. |
| `RunFinishedDetail` / `ToolRun` | type | `ag-ui-run-finished` detail: the tools an interaction ran, which side ran them, and how it ended. |
| `CustomAgentDetail` | type | `ag-ui-custom` detail: an AG-UI `CUSTOM` event's `name` and `value`, verbatim. |
| `InvalidateDetail` | type | `ag-ui-invalidate` detail: the resource `keys` that moved, and the `reason`. |
| `FeedbackDetail` | type | `ag-ui-feedback` detail: the rated message's `messageId`, its `threadId`, the `runId` that streamed it (live only), its `content` and the `rating`. See [Storing a rating](messages.md#storing-a-rating). |
| `relativeTime` | function | The built-in locale-neutral timestamp formatter (`"5m ago"`), for a host building on it. |
| `RelativeTimeFormatter` | type | What `formatRelativeTime` takes: an epoch-ms timestamp in, row text out. |
| `renderSuggestionChips` | function | Draw a `suggestions` activity as chips that send themselves; `null` when nothing survives. |
| `suggestionPrompts` | function | The usable prompts in a `suggestions` activity's content, bounded and trimmed. |
| `attachMessageActions` | function | Give a finished bubble its action row (copy, and feedback when a handler is passed). |
| `messageActionBar` | function | The empty action row for a bubble, created if it has none — the shared shell both callers use. |
| `MessageActionsOptions` | type | What `attachMessageActions` takes: `strings`, a `text` source, an optional `html` source for the rich clipboard flavour, an optional `onFeedback`. |
| `ActivityRenderer` | type | Draws one activity from its `content` and an `ActivityRenderContext`. Pure: it runs again on every restore. |
| `ActivityRenderContext` | type | What a renderer is told besides the content (`{ messageId, previous, live }`): the node it drew last for that id, and whether the draw is live. |
| `ActivityRegistration` | type | What `registerActivityRenderer` takes: `type`, `render`, and an optional `removedNotice`. |

## Durability

| Export | Kind | Summary |
| --- | --- | --- |
| `SessionStorageStore` | class | Default per-tab conversation store. |
| `RemoteConversationStore` | class | Server-backed store over a `data-threads-url` endpoint; its read-only `local` is the store holding the thread pointer and checkpoints. |
| `ClientConversationStore` | type | The persistence seam. |
| `ThreadTab` | type | One open thread in `tabs` (`{ threadId, title }`). |
| `TabsDetail` | type | `ag-ui-tabs` event detail (`{ tabs, reason }`). |
| `ThreadMeta` | type | A thread-drawer row (`{ threadId, title, updatedAt, preview, unread?, status?, reason?, interrupts?, parent?, routine? }`, `routine` `{ id, name }` on a thread a routine started); see [Thread status](threads.md#thread-status), [Child sessions](tool-calls.md#child-sessions) and [Routines](skills.md#routines). |
| `ThreadParent` | type | A child thread's parent, as `ThreadMeta.parent` names it (`{ threadId, scope }`, `scope` `null` in an unscoped store). |
| `ThreadRoutine` | type | The routine that started a thread, as `ThreadMeta.routine` names it (`{ id, name }`). |
| `ThreadStatus` | type | A thread's run status as the server lists it: `idle`, `running`, `waiting` or `failed`. |
| `ThreadsTransport` | type | How `watchThreads` follows the list: `poll` or `stream`. |
| `NavigationCheckpoint` | type | The pre-reload checkpoint marker. |
| `RunIndex` | class | Reads a `data-runs-url` run index and derives its resume / fork endpoints. |
| `RunRow` | type | One run index row (`{ run_id, thread_id, parent_run_id, started_at, continuable, preview? }`). |
| `CheckpointMenu` | class | The *Continue a run* panel. |
| `CheckpointVerb` | type | `"resume" \| "fork"`. |

## Attachments

| Export | Kind | Summary |
| --- | --- | --- |
| `uploadAttachment(file, options)` | function | The built-in upload (multipart, progress) → `AttachmentRef`. |
| `UploadOptions` | type | `{ url, headers?, credentials?, onProgress?, signal? }`. `credentials` is spelled as a fetch mode but carried by `XMLHttpRequest.withCredentials`, so only `"include"` is distinguishable. |
| `UploadHandler` | type | `(file, onProgress, signal?) => Promise<AttachmentRef>` — the `uploadHandler` swap seam (tus / S3). The signal fires when the tray removes a chip or the element is torn down; a handler that honours it aborts its own transport, so a cancelled upload leaves no orphaned file on the server. |
| `AttachmentRef` | type | The durable upload ref (`{ id, name, mime, size, url? }`). |
| `messageAttachments(message)` | function | Read the refs a restored user message carries: from its `metadata`, or from the top level where an earlier release stored them. |

## Voice input

| Export | Kind | Summary |
| --- | --- | --- |
| `transcribeAudio(audio, options)` | function | The built-in transcription POST (multipart) → the transcript text. |
| `TranscribeOptions` | type | `{ url, headers?, credentials? }` — `credentials` as fetch's own cookie mode. |
| `TranscribeHandler` | type | `(audio) => Promise<string>` — the `transcribeHandler` swap seam (Web Speech, direct-to-provider). |

## UI & DOM primitives

| Export | Kind | Summary |
| --- | --- | --- |
| `ToolCallCard` | class | A live tool-call card for the transcript. |
| `ToolCallStatus` / `SettledStatus` / `ToolDisplayMode` | type | Card lifecycle states + display mode. |
| `ToolGroupDisplayMode` | type | How an opened step group draws its calls (`TOOL_GROUP_DISPLAY`'s values). |
| `ToolPayloadFormatter` | type | Draws one region of a card's body (`AgUiChat.formatToolPayload`); `null` falls through to the built-in pretty-print. |
| `ToolPayload` | type | The region being drawn: `arguments` (the parsed record) or `result` (the raw string and its outcome). |
| `ToolCallCardOptions` | type | Per-card wiring beyond name / args / label / strings — currently `formatPayload`. |
| `requestConfirmation(host, request, options?)` | function | Append the inline confirmation card to the transcript. |
| `ConfirmationRequest` | type | What the card displays. |
| `ConfirmationOptions` | type | `{ signal?, strings?, onAlwaysAllow? }` — abort resolves the card as declined; `strings` localizes it; passing `onAlwaysAllow` is what adds the third button. |
| `UiStrings` | type | The flat table of every user-facing string. |
| `DEFAULT_UI_STRINGS` | const | The English defaults (the override floor). |
| `mergeUiStrings(overrides)` | function | Merge a partial override over the defaults. |
| `renderMarkdown(text, options?)` | function | Render sanitized markdown/HTML (marked + DOMPurify). |
| `RenderMarkdownOptions` | type | `{ allowImages? }` — opt `<img>` back into the sanitized output. |
| `requestApproval(host, request, options?)` | function | Append the inline approval card that gates a server-side tool. |
| `ApprovalRequest` | type | What that card displays (`{ message?, toolName?, args? }`). |
| `ApprovalOptions` | type | `{ signal?, strings?, onEdit? }` — abort resolves the card as denied; `strings` localizes it; passing `onEdit` offers the call's arguments for editing and is called only when they actually changed. |
| `ApprovalRenderer` | type | Replace the built-in approval card outright (`AgUiChat.approvalRenderer`). |
| `requestQuestion(host, request, options?)` | function | Append the inline `ask_user` card (radios and/or free text). |
| `QuestionRequest` | type | What that card asks. |
| `QuestionOptions` | type | `{ signal?, strings? }` — abort resolves it with an empty answer. |
| `QuestionRenderer` | type | Replace the built-in question card outright (`AgUiChat.askUserRenderer`). |
| `renderChart(spec)` | function | Draw one spec as a self-contained block, or `null` when it says nothing. |
| `chartSpecFrom(value)` | function | Read an arbitrary payload into a `ChartSpec`, or `null` if it cannot be drawn honestly. |
| `ChartSpec` / `ChartSeries` / `ChartKind` | type | A chart as data, one named series, and how it is drawn. |
| `attachQuoteOffer(options)` | function | The page-side select-then-quote offer, with its guards. `AgUiChat.offerQuoteInPage()` is the one-line form. |
| `PageQuoteOffer` / `PageQuoteOfferOptions` | type | The live offer (`{ element, detach }`) and what it takes. |
| `quotableSelection(container, roots, near?)` | function | The current selection when it lies inside `container`, read through the shadow-aware API where the engine has one. `near` is where the gesture ended, used to pick the line the offer hangs from. |
| `QuotableSelection` | type | `{ text, rect }` — what was selected, and where it sits. |
| `asQuote(text)` | function | Shape text as a markdown blockquote with a blank line after it. |
| `MAX_QUOTE_CHARS` | const | The cap a quotation is truncated to (500). |
| `typeInto` / `highlightThenClick` / `pressThenClick` / `selectOption` / `toggleControl` / `scrollIntoCenterView` / `flash` / `focusWithFlash` / `prefersReducedMotion` | function | Animation primitives. |
| `showHighlightOverlay` | function | Ring a host-page element from an overlay drawn outside it, optionally dimming everything else or flowing a gradient round it. Returns a function that removes it. |
| `HighlightOverlayOptions` | type | Options for `showHighlightOverlay`. |
| `fillField` / `clickElement` / `pressButton` / `selectControl` / `setControlValue` / `toggleCheckbox` | function | DOM-driver primitives. |
| `setNativeValue` / `setNativeChecked` | function | Set a control via its native prototype setter (React-controlled inputs). |
| `TypeOptions` / `HighlightClickOptions` / `PressOptions` / `SelectOptions` / `ToggleOptions` / `FlashOptions` / `ScrollOptions` / `FillFieldOptions` / `TextLikeElement` / `RingOwnerOptions` | type | Primitive option shapes. `RingOwnerOptions` is the `chat` the ring-drawing ones share; see [Ring colour](concepts.md#ring-colour). |

## Constants

| Export | Summary |
| --- | --- |
| `ELEMENT_TAG` | The registered tag name (`ag-ui-chat`). |
| `SUBMIT_EVENT` | The submit CustomEvent name. |
| `THREAD_EVENT` | The conversation-changed CustomEvent name (`ag-ui-thread`). |
| `OPEN_THREAD_EVENT` | The open-another-thread CustomEvent name (`ag-ui-open-thread`), fired cancelable by a child-session link or a parent breadcrumb; see [Child sessions](tool-calls.md#child-sessions). |
| `THREAD_TITLE_EVENT` | The thread-title CustomEvent name (`ag-ui-thread-title`). |
| `TABS_EVENT` | The tabs CustomEvent name (`ag-ui-tabs`); see [Open threads (tabs)](header-and-panel.md#open-threads-tabs). |
| `THREADS_CHANGE_EVENT` | The thread-list CustomEvent name (`ag-ui-threads-change`), fired by a chat watching its list under `data-thread-status`. |
| `AGENTS_TAG` | The provider's tag name (`ag-ui-agents`). |
| `AGENTS_CHANGE_EVENT` | The directory CustomEvent name (`ag-ui-agents-change`). |
| `INBOX_CHANGE_EVENT` | The inbox CustomEvent name (`ag-ui-inbox-change`). |
| `AGENT_CHANGE_EVENT` | The agent-switch CustomEvent name (`ag-ui-agent-change`). |
| `TOGGLE_EVENT` | The collapse-toggle CustomEvent name (`ag-ui-toggle`). |
| `MAXIMIZE_EVENT` | The maximized-state CustomEvent name (`ag-ui-maximize`). |
| `BAR_HEIGHT_EVENT` | The bottom bar's height CustomEvent name (`ag-ui-bar-height`). |
| `DOCK_WIDTH_EVENT` | The docked panel's width CustomEvent name (`ag-ui-dock-width`). |
| `UNREAD_EVENT` | The unread-count CustomEvent name (`ag-ui-unread`). |
| `THEME_EVENT` | The theme-change CustomEvent name (`ag-ui-theme`), `detail` `{ scheme }`. |
| `RUN_FINISHED_EVENT` | The interaction-finished CustomEvent name (`ag-ui-run-finished`). |
| `CUSTOM_AGENT_EVENT` | The agent-`CUSTOM` CustomEvent name (`ag-ui-custom`). |
| `INVALIDATE_EVENT` | The resource-invalidation CustomEvent name (`ag-ui-invalidate`). |
| `FEEDBACK_EVENT` | The message-rating CustomEvent name (`ag-ui-feedback`). |
| `SUGGESTIONS_ACTIVITY_TYPE` | The `activity_type` carrying follow-up prompts (`suggestions`). |
| `MAX_SUGGESTIONS` | Most prompts one push draws (4). Mirrors the server's cap. |
| `MAX_SUGGESTION_CHARS` | Longest one prompt may be (120). Mirrors the server's cap. |
| `INVALIDATE_CUSTOM_NAME` | The AG-UI `CUSTOM` `name` that carries one (`ag_ui.invalidate`). |
| `ATTACHMENT_EVENT` | The attachments-changed CustomEvent name (`ag-ui-attachments`). |
| `STATE_EVENT` | The shared-state CustomEvent name (`ag-ui-state`). |
| `CHART_ACTIVITY_TYPE` | The `ACTIVITY_SNAPSHOT` type a server sets to push a chart. |
| `CHART_TOOL_NAME` | The name the built-in chart tool registers under (`render_chart`). |
| `COMPACTION_ACTIVITY_TYPE` | The `ACTIVITY_SNAPSHOT` type reporting a trimmed history. |
| `LOAD_CAPABILITY_TOOL` | The agent-side capability-loading tool's name. |
| `MESSAGE_ROLE` | Message role constants. |
| `MESSAGE_ACTIONS` | The message-action tokens `data-message-actions` selects by (`copy` / `retry` / `feedback`). |
| `TOOL_CALL_STATUS` | Tool-call card status constants. |
| `TOOL_DISPLAY` | Tool-call display-mode constants (`inline` / `minimal` / `compact` / `full`). |
| `TOOL_GROUP_DISPLAY` | How an opened step group draws its calls under `grouped` (`inline` / `minimal` / `compact` / `full`). |
| `TOOL_OUTCOME` | How a tool call ended, as a server states it on `TOOL_CALL_RESULT` (`success` / `failed` / `denied`). |
| `X_CONFIRM_KEY` | Confirmation-prompt key: on a tool's JSON Schema for a client-side confirmation, and in an AG-UI interrupt's `metadata` for a server-side approval. |
| `X_SUMMARY_KEY` | JSON-Schema key carrying a short tool-card label. |
| `MAX_TOOL_ROUNDS` | Upper bound on tool-call → re-run rounds per send. |
| `VERSION` | The package version string. |
