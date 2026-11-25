# Quickstart

Drop the element into your page and register the tools the agent may call:

```html
<script type="module">
  import { fillField, clickElement, X_DESTRUCTIVE_KEY } from "@artooi/agents-web-components";
  import { defineChat } from "@artooi/agents-web-components/chat";

  // Register the <ag-ui-chat> Custom Element. An explicit call, not an import
  // side effect, so importing the package defines nothing. Idempotent; it throws
  // if another class already holds the tag (a second copy of the element).
  defineChat();

  const chat = document.querySelector("ag-ui-chat");

  // Extra request headers (e.g. CSRF), sent with every request the element makes.
  // For a credential that rotates, set chat.getHeaders instead - it is consulted
  // per request. See "Authenticating requests".
  chat.headers = { "X-CSRFToken": getCsrfToken() };

  // A non-destructive tool: fills a text field with a typing animation.
  chat.registerTool({
    name: "fill_field",
    description: "Fill a text input by id with a value.",
    parameters: {
      type: "object",
      properties: { field: { type: "string" }, value: { type: "string" } },
      required: ["field", "value"],
    },
    handler: async ({ field, value }) => {
      await fillField(document.getElementById(field), String(value));
      return "ok";
    },
  });

  // A destructive tool: x-destructive at the JSON-Schema root gates it behind
  // the inline confirmation card before the handler runs.
  chat.registerTool({
    name: "save_article",
    description: "Save the article. Destructive — asks for confirmation.",
    parameters: { type: "object", properties: {}, [X_DESTRUCTIVE_KEY]: true },
    handler: async () => {
      await clickElement(document.getElementById("save"));
      return "saved";
    },
  });
</script>

<ag-ui-chat endpoint="/agent/" title-text="Assistant"></ag-ui-chat>
```

!!! important

    **If nothing appears, check that `defineChat()` ran.** Forgetting it looks
    like nothing at all. `<ag-ui-chat>` is then an *unknown element*, which every
    browser renders as an inline 0x0 box, in flow, with no console warning and no
    error — so the page looks finished and the chat is simply absent. There is
    nothing to search for.

    A bare `import "@artooi/agents-web-components"` registers nothing, deliberately:
    registration is an explicit call so the package stays tree-shakeable.

    `customElements.get("ag-ui-chat")` in a console answers it in one line.
    `undefined` means the call did not run.

That's the whole integration: an `endpoint` attribute pointing at your AG-UI server, optional
`headers`, and the tools you want the agent to be able to invoke in the browser. If your API is on
another origin, add `credentials="include"` too; see
[Authenticating requests](authentication.md#authenticating-requests).

## Attributes and properties

**Attributes** (set in HTML; the CSS-only ones are styling presets with no JS API):

| Attribute | Property | Notes |
| --- | --- | --- |
| `endpoint` | `endpoint` | The AG-UI endpoint URL. Required to send: without it a send is refused with a `console.error` naming the missing attribute and a `not-connected` run notice in the transcript. Reflecting getter + setter. |
| `credentials` | `credentials` | Cookie policy for every request the element makes: `omit` / `same-origin` / `include`. Unset means the browser default (`same-origin`), which sends no cookies cross-origin. See [Authenticating requests](authentication.md#authenticating-requests). |
| `title-text` | — | Header label; defaults to `"Assistant"`. `"auto"` makes the header, the rail and the bar label follow the thread on screen (`threadTitle`), falling back to the strings table's `title` while it has none. Live: writing it after the element connects re-labels the header. See [When each attribute is read](#when-each-attribute-is-read). |
| `data-tool-display` | `toolDisplay` | How tool calls are drawn: `grouped` (the default: a run's consecutive calls fold into one row) / `inline` / `minimal` / `compact` / `full` (per-call cards; `full` was the default before `grouped`). An unknown value reads as `grouped`. See [Tool-call display modes](tool-calls.md#tool-call-display-modes). |
| `data-tool-group-display` | `toolGroupDisplay` | How an opened step group draws its calls under `grouped`: `full` (the default) / `compact` / `minimal` / `inline`. Ignored under the four card modes. An absent or unknown value reads as `full`. See [Choosing how a group draws its calls](tool-calls.md#choosing-how-a-group-draws-its-calls). |
| `data-text-animation` | — | Incoming-text reveal: `none` (default) / `fade` / `word`. |
| `data-prompt-chips` | — | Present (bare, or any value but `"false"`) to surface skills as chips. |
| `data-slash-commands` | — | Present (bare, or any value but `"false"`) to enable the `/`-command palette. |
| `data-skills` | — | Inline JSON skill catalog. A value that will not parse is ignored and reported on the console, rather than reading as an empty catalog. |
| `data-skills-url` | — | URL of a JSON skill catalog (fetched with the element's headers and cookie policy). |
| `data-skill-editor-url` | — | URL of django-ag-ui's skill editor endpoint (`skills/editor/`). Opts into the [skill editor](skills.md#the-skill-editor): a "Manage skills" row at the foot of the `/` palette under `data-slash-commands`, a header button with `data-skill-editor-button`, or `openSkillEditor()`. |
| `data-routines-url` | — | URL of django-ag-ui's routines editor (`routines/`, from 0.86.0). Opts into [routines](skills.md#routines): a Routines button in the header, a Make this a routine item in its More menu, `openRoutines()` and `makeRoutine()`. Read at connect time, like the other endpoint URLs. |
| `data-routine-minute-step` | `5` | The minute step of the routine form's time field, a whole number from 1 to 30; anything else keeps 5. Read each time the form opens. A routine saved at a minute off the step still shows that minute. See [The time and timezone fields](skills.md#the-time-and-timezone-fields). |
| `data-skill-editor-button` | absent | With `data-skill-editor-url`, also puts a Skills button in the header. Off by default. On a narrow panel it moves into the header's [More menu](header-and-panel.md#the-header-row-and-its-more-menu) like the other optional controls. |
| `data-editors` | absent | `external` hands the skill editor and routines to the page: the Skills and Routines buttons, Make this a routine and the palette's Manage skills fire `ag-ui-open-editor` instead of opening the view in the panel, for an [editor element](editors.md#the-editors-on-a-page-of-their-own) to answer. Read at each click. The methods still open the panel. |
| `data-tools-url` | — | URL of a server tool-label catalog (`[{ name, summary, description? }]`), fetched with the element's headers and cookie policy; labels tool-call cards for server-side tools. |
| `user-key` | `userKey` | Who the stored conversation belongs to — any string identifying the signed-in principal. Joins the storage namespace, and **changing it purges what the previous principal left behind**. Live (not connect-time): a logout is the host's to announce. See [Who the stored conversation belongs to](durability.md#who-the-stored-conversation-belongs-to-user-key). |
| `user-name` | `userName` | The signed-in user's display name, for the [greeting](theming.md#the-greeting-on-an-empty-page) an empty conversation shows under `placement="page"`. Presentation only: unlike `user-key` it scopes nothing and is never sent. Absent or blank gives the nameless greeting. Live. |
| `data-threads-url` | — | URL of a server thread index (django-ag-ui's `ThreadsView`, or any server that keeps to [the threads contract](threads-contract.md)); enables durable, cross-device chat history. |
| `data-detach-runs` | — | Opt-in, read at each request. With `data-threads-url`, a run outlives its connection: a thread switch, New chat or the element leaving the page lets go of it instead of stopping it, opening a thread whose run is still going joins it, and Stop posts the thread's `cancel/`. Needs a django-ag-ui 0.82.0+ mount; see [Runs that outlive their connection](concepts.md#runs-that-outlive-their-connection). Without `data-threads-url` it does nothing. |
| `data-poll-runs` | — | Opt-in, live. With `data-detach-runs` and `data-threads-url`, the chat asks the open thread's run log every five seconds while idle and joins a run the server started there by itself (a child's report waking its parent, say), or restores the thread when that run parked on an approval, with no thread watch. Under `data-thread-status` the watch already does this; see [Runs that outlive their connection](concepts.md#runs-that-outlive-their-connection). |
| `data-threads-cache` | — | **On by default.** `="false"` stops mirroring message bodies into `sessionStorage` when `data-threads-url` is set, for a deployment that put history on the server so transcripts stay off the client. Only meaningful alongside `data-threads-url`. |
| `data-runs-url` | — | URL of a server run index (django-ag-ui's `RunsView`); reveals the header's *Continue a run* panel. See [Resuming a run](durability.md#resuming-a-run). |
| `data-attachments-url` | — | URL of the file-upload endpoint (django-ag-ui's `AttachmentsView`); reveals the composer's paperclip picker, drag-and-drop, and paste. |
| `data-attachment-accept` | — | `<input accept>` list for client-side type filtering (e.g. `image/*,.pdf`). The server stays authoritative. |
| `data-attachment-max-bytes` | — | Client-side upload size cap in bytes (default 10 MiB; `0` disables). The server stays authoritative. |
| `data-transcribe-url` | — | URL of the voice-transcription endpoint (django-ag-ui's `TranscribeView`); reveals the composer's mic button. See [Voice input](api.md#voice-input). |
| `data-theme-toggle` | — | Boolean: show a built-in header light⇄dark toggle (persists per tab). Off by default. See [Theme toggle](theming.md#theme-toggle). |
| `data-strings` | `strings` | Partial JSON override of the UI string table (localization). The property wins key-by-key over the attribute; a value that will not parse is ignored and reported on the console. See [Internationalization](i18n.md#internationalization-i18n). |
| `data-icon-url` | — | Header (and launcher) icon image URL. A slotted `slot="icon"` wins; see [Header & launcher icon](theming.md#header-and-launcher-icon). |
| `data-launcher-icon-url` | — | Icon image URL for the collapsed launcher only, when it should differ from the header's. Falls back to `data-icon-url`; a slotted `slot="launcher"` wins over both. |
| `data-unread-badge` | — | **On by default.** `="false"` hides the launcher's unread badge; the count and the `ag-ui-unread` event keep running. See [Collapsing to the launcher](header-and-panel.md#collapsing-to-the-launcher). |
| `data-launcher-drag` | — | **On by default.** `="false"` leaves the widget wherever your CSS puts it. Otherwise the collapsed launcher can be dragged anywhere on screen (the panel opens into the clearest space) and the open panel can be dragged by its header. See [Moving the launcher](header-and-panel.md#moving-the-launcher) and [Moving the panel](header-and-panel.md#moving-the-panel). |
| `data-quote-selection` | — | **On by default.** `="false"` stops the transcript offering to quote a selection. `quote()` keeps working either way. See [Quoting a selection](messages.md#quoting-a-selection). |
| `data-message-actions` | — | **Copy and retry by default; feedback is opt-in.** A comma list of the actions a finished answer keeps: `copy` / `retry` / `feedback` (e.g. `"copy,retry,feedback"` to add the rating pair, which needs an `ag-ui-feedback` listener). `="false"` removes the row entirely. See [Message actions](messages.md#message-actions-copy-retry-feedback). |
| `data-max-tool-rounds` | — | Upper bound on frontend tool-call → re-run rounds within one send (default 10; a value below 1 is ignored). Raise it for a page-driving agent whose turn takes many small steps. See [The run loop](concepts.md#the-run-loop-and-the-ag-ui-client). |
| `data-page-actions` | — | Opt-in built-in page-action tools: a comma list of `scroll` / `drag` / `chat` (e.g. `"scroll,drag"`). See [Page-action tools](concepts.md#page-action-tools). |
| `data-side` | — | For `placement="sidebar"`: which edge it docks to, `right` (default) / `left`. Styling, and read by script for the side `dockWidth` and `ag-ui-dock-width` report. Live. |
| `data-collapse-icon` | — | The header collapse control's mark: `panel-close` (a window with its docked pane and an arrow into the edge, mirrored on `data-side="left"`) / `chevron-up` / `chevron-down` / `chevron-left` / `chevron-right`. Absent, or any other value, follows the placement: `panel-close` on `sidebar` (and `side`), `chevron-down` everywhere else. A host icon in `slot="icon-collapse"` wins over it. Live. |
| `data-answer-well` | — | CSS-only boolean: box each assistant turn (its text, tool cards, and thinking) in one bordered "well". Off by default. See [The answer well](theming.md#the-answer-well). |
| `collapsed` | `collapsed` | Reflected boolean; collapses the widget to its [launcher](header-and-panel.md#collapsing-to-the-launcher) (a rail under `placement="sidebar"`, the header bar under `embedded`). Persisted per tab. `placement="page"` has no collapsed state and ignores it. |
| `collapse-to` | — | What the panel collapses to: `auto` (the default; absent or any other value reads the same) leaves every placement as it is, `bar` draws a strip along the bottom edge in place of the round launcher, `none` hides the collapsed widget so the host's own control brings it back. Under either, a corner panel still moves by its header and `moveTo` on a wide viewport, and remembers where it was dragged. Live. See [Collapsing to a bottom bar](header-and-panel.md#collapsing-to-a-bottom-bar). |
| `anchor` | `anchor` | Under `collapse-to="none"`, a selector for the host's element the panel rises from, right-aligned to it. The `anchor` property takes an element instead and wins over the attribute. Live. |
| `maximized` | `maximized` | Reflected boolean; grows the open panel to its [maximized size](header-and-panel.md#maximizing-the-panel). Refused on `page`, `full` and `embedded`, at 600px or less, and while collapsed; a collapse leaves it. Not persisted. Live. |
| `anchor-side` | — | Under `collapse-to="none"` with an anchor, which side of it the panel opens on: `above`, `below`, or `auto` (the default, and any other value), which takes the side with more room and re-decides on a window resize, never during a drag. Live. |
| `data-dragging` | — | **Written by the element, not by you.** Stamped on whichever handle a gesture is currently using, so the styles can react and so the element knows not to re-place the widget under a drag in progress. Cleared on `pointerup` and on `pointercancel`. |
| `data-expand-corner` | — | **Written by the element, not by you.** It stamps the corner a dragged or agent-moved panel opens from, so the collapse animation starts where the panel actually is. Listed because the element reads its own stamp back; setting it yourself is overwritten on the next move. |
| `data-greeting` | — | CSS-only: `off` turns the [greeting layout](theming.md#the-greeting-on-an-empty-page) off under `placement="page"`, where it is on by default. Any other value turns it on under `placement="embedded"`. No other placement has it. |
| `data-empty` | — | **Written by the element, not by you.** Present while the conversation has nothing in it, which is when the greeting shows. Public as a styling hook, so the chrome around a full-page chat can react to the same state, e.g. `ag-ui-chat[data-empty] ~ .page-footer { display: none }`. |
| `data-running` | — | **Written by the element, not by you.** Present while an interaction is in flight, the same state that shows the Stop button (see the `running` property). Public as a styling hook, as `data-empty` is, so the chrome around the chat can react to it, e.g. `ag-ui-chat[data-running] ~ .toolbar button { pointer-events: none }`. |
| `data-threads-search` | — | When the conversation list shows its search box: `auto` (absent, or any other value) from eight conversations, `always` over any list, `never` not at all. Live. See [The conversation list](theming.md#the-conversation-list). |
| `data-thread-status` | — | Watch the conversation list for run status and unread: `poll` asks again every five seconds with the last ETag, `stream` follows the server's event stream (and polls when the server answers with JSON). Each list is handed on in `ag-ui-threads-change`. Needs a store with `watchThreads`, as `data-threads-url` gives. Live. See [Thread status](threads.md#thread-status). |
| `data-small-viewport` | — | `off` keeps the desktop layout at every width, opting out of the [small-viewport override](theming.md#small-viewports). Styling, and read by script for the width `dockWidth` reports on a phone. Live. Everything that override sets is a token you can re-state; its trigger is a media query, which is the one thing you cannot. |
| `data-paste-attach` | — | When to turn a long text paste into an attachment instead of composer text: absent for the 5000-character default, `off` to never, or a positive number of characters. Only acts where `data-attachments-url` (or a custom `uploadHandler`) gives it somewhere to go. |
| `data-starters` | — | JSON array of prompts offered on an empty transcript, e.g. `'["Summarise this page"]'`. Fallback content for `slot="empty"`, so slotting your own replaces them. Shares the four-prompt and 120-character limits with the suggestion chips a run pushes. Read once at connect. |
| `data-start-open` | — | Mount the panel open on a first visit. The corner placements otherwise rest at their launcher, the way every corner chat does; a stored choice wins over both. The placements that place themselves are unaffected. |
| `show-usage` | — | Present (bare, or any value but `"false"`) to draw a muted token-usage line under each finished turn, from the usage `RUN_FINISHED` carries (django-ag-ui's `include_usage`). Read when the turn settles. See [When a run fails, and what it cost](concepts.md#when-a-run-fails-and-what-it-cost). |
| `theme` | — | Styling: an optional theme name (`quiet` (default) / `soft` / `ledger` / `classic`, or a word of your own) and an optional scheme (`light` (default) / `dark` / `auto`), in any order, e.g. `soft dark`. Live: the [header theme toggle](theming.md#theme-toggle)'s glyph follows a scheme written after connect. See [Themes](theming.md#themes). |
| `density` | — | CSS-only: `comfortable` (default) / `compact`. |
| `placement` | — | CSS-only: `floating` (default) / `sidebar` / `page` / `embedded` / `full`. `full` fills the viewport at every width, inside the safe-area insets; the `--ag-ui-inset`, size and `--ag-ui-panel-radius` tokens still apply. |

Each header control also takes its own icon slot — `icon-history`, `icon-checkpoints`,
`icon-new`, `icon-maximize`, `icon-collapse` — with the built-in drawn glyph as the fallback, so a host can project a
brand `<img>` or `<svg>` in its place. The built-in header marks are drawn at
`--ag-ui-glyph-size`. The composer's glyphs work the
same way: `icon-send`, `icon-stop`, `icon-attach`, `icon-voice`.

```html
<ag-ui-chat endpoint="/agent/">
  <svg slot="icon-new" width="16" height="16"><!-- ... --></svg>
</ag-ui-chat>
```

The collapse control's built-in mark follows the placement, because a sidebar hides sideways
into its edge rather than down: `panel-close` (a window with its docked pane and an arrow into
the edge) on `sidebar` and `side`, mirrored for either on `data-side="left"`, and
`chevron-down` on `floating`, `full`, `embedded` and every other placement. `data-collapse-icon`
picks one of the built-in marks outright, at any placement and live: `panel-close`,
`chevron-up`, `chevron-down`, `chevron-left` or `chevron-right`; any other value reads as
absent. `panel-close` always points into the edge the panel docks to, so it mirrors on a left
docked panel whether chosen or defaulted; the chevrons do not turn. For a mark of your own, slot it
into `icon-collapse`, which wins over the attribute and every placement:

```html
<ag-ui-chat endpoint="/agent/" placement="floating" data-collapse-icon="chevron-right"></ag-ui-chat>
<ag-ui-chat endpoint="/agent/" placement="sidebar">
  <svg slot="icon-collapse" width="16" height="16"><!-- ... --></svg>
</ag-ui-chat>
```

### When each attribute is read

The element observes two groups of attributes, and they behave differently once it is in the DOM.
Nothing outside those groups is observed: a CSS-only attribute (`theme`, `density`,
`data-answer-well`, `data-tool-group-display`) is read by the stylesheet rather than by script, and `endpoint`,
`data-tool-display`, `data-text-animation`, `data-runs-url`, `data-page-actions`,
`data-message-actions`, `data-max-tool-rounds`, `data-unread-badge`, `data-launcher-drag` and
`data-quote-selection` are re-read at each use, so a late write to any of those simply takes effect. The one attribute in
neither camp is `data-launcher-icon-url`: it is read while the element connects, like the group
below, but is not observed, so a late write is inert and says nothing.

**Live attributes.** Written at any time, before or after the element connects, and acted on
either way: `title-text`, `placement`, `collapse-to`, `anchor`, `anchor-side`, `maximized`, `data-side`, `data-small-viewport`, `data-threads-search`, `data-thread-status`, `data-poll-runs`, `credentials`, `user-key`,
`user-name`, `data-tool-group-display`, `data-collapse-icon`, `theme`.

**Connect-time attributes.** Read once, while the element connects, to decide what chrome exists at
all — the tray, the mic, the skills menu, the header mark. Writing one afterwards has **no effect**;
the element logs a console warning naming the attribute rather than failing silently, because the
symptom is an affordance that never appears and that reads as a broken component. Set them before
the element enters the DOM, or remove and re-insert it. See
[Framework hosts](authentication.md#framework-hosts-configure-before-you-insert), where the boundary bites hardest.
The list: `data-attachments-url`, `data-attachment-accept`, `data-attachment-max-bytes`,
`data-transcribe-url`, `data-threads-url`, `data-threads-cache`, `data-tools-url`,
`data-skills-url`, `data-skill-editor-url`, `data-skill-editor-button`, `data-routines-url`, `data-skills`, `data-prompt-chips`,
`data-slash-commands`, `data-theme-toggle`, `data-strings`, `data-icon-url`.

What re-inserting costs: the chrome is built again from the attributes as they stand, a run in
progress is cancelled, and the conversation is redrawn from its stored history — the same rebuild
`reload()` performs, and the reason that method exists for a host that can only configure the
element after the fact.

**Properties** (JS only, not attributes): `headers`, `getHeaders`, `trustedOrigins`, `allowImages`,
`autoConfirm`, `confirmPredicate`, `askUser`, `askUserRenderer`, `approvalRenderer`,
`approveWithEdits`, `agentFactory`, `getTools`, `getContext`, `routeMap`, `navigate`, `getPageMap`,
`autoInjectPageMap`, `getPlace`, `conversationStore`, `uploadHandler`, `transcribeHandler`, `navigationResult`,
`skillContext`, `toolSummaries`, `formatToolPayload`, `formatRelativeTime`, `strings`,
`resolvePageTarget`, `sharedState`, `anchor` (an element, which wins over the attribute's selector), `extraStyles` ([unstable](theming.md#d-extrastyles-the-last-mile)), plus the read-only `unread`, `unhandledActivityTypes`, `threadId`, `threadTitle`, `tabs`, `running`, `barHeight`, `dockWidth`, `uiStrings`, `colorScheme` and `locale`, and
the attribute mirrors `endpoint` / `userKey` / `userName` / `toolDisplay` / `toolGroupDisplay` / `collapsed` /
`maximized` / `credentials` / `detachRuns`.

`headers` and `getHeaders` authenticate **every** request the element makes, not only the agent
run; `getHeaders` is the one to use for a credential that rotates. See
[Authenticating requests](authentication.md#authenticating-requests).

`allowImages` (default `false`) re-enables `<img>` in rendered assistant markdown.
It is off by default because a model-controlled image URL is fetched by the browser
with no user interaction — a zero-click exfiltration channel for prompt-injected
page data. Enable only when the content source is trusted.

`toolSummaries` is a `Record<string, string>` mapping tool name → a friendly card
label, used when a tool has no `x-summary` in its own schema. Built-in and client tools
should carry `x-summary` directly; this map is the seam for **server-side tools** (drf-mcp,
the django-ag-ui `@tool` registry), whose schema never reaches the browser — e.g.
`chat.toolSummaries = { list_projects: "Search projects" }`. Or point
`data-tools-url` at a server catalog endpoint (django-ag-ui's `tools/`) and the
labels are fetched automatically — per card, `x-summary` → an explicit
`toolSummaries` entry → the fetched catalog → the raw name.

`sharedState` is AG-UI shared state, documented under
[the run loop](concepts.md#the-run-loop-and-the-ag-ui-client); `unread` and `unhandledActivityTypes` are
read-only counters, covered under [the unread badge](header-and-panel.md#the-unread-badge) and
[finding out what arrived](server-pushed-ui.md#finding-out-what-arrived); `threadId` and `running` are covered under
[driving the conversation from your own chrome](header-and-panel.md#driving-the-conversation-from-your-own-chrome).

Code blocks in an agent's answer carry a **copy button**, revealed on hover or
keyboard focus and styleable via the `code-copy` part. Override its labels with
the `copyCode` / `copied` / `copyFailed` strings.

**Methods**: `registerTool`, `registerPageState`, `registerActivityRenderer`, `registerContext`,
`setSkills`, `refreshSkills`, `openSkillEditor`, `closeSkillEditor`, `openRoutines`, `makeRoutine`, `routineSeed`, `closeRoutines`, `sendMessage`, `run`, `attachFile`, `appendMessage`, `retryLastTurn`, `quote`, `offerQuoteInPage`,
`enableCharts`, `newChat`, `setCollapsed`, `toggleCollapsed`, `setMaximized`, `toggleMaximized`,
`describeSurface`, `moveTo`, `resetSize`, `toggleTheme`, `openThreads`, `closeThreads`, `switchThread`, `deleteThread`, `openTab`, `closeTab`,
`openCheckpoints`, `closeCheckpoints`, `toggleCheckpoints`, `refreshPlace`, `request`, `tokenValues` and `reload`.

`request(url, init?)` is `fetch` as the element authenticates: `headers` and `getHeaders()` under
`init.headers` (which win per key), and `credentials` unless `init` names its own. A destination
outside `trustedOrigins` is reported as the element's own requests are. It is the seam a separate
entry such as `./mcp-apps` reaches the host's routes through.

`refreshSkills()` fetches `data-skills-url` again, so the `/` palette lists a skill written
elsewhere. `routineSeed()` is what Make this a routine would fill a form with: `{ prompt, name }`
from the conversation's user messages, or `null` before anything is said. An
[editor element](editors.md#the-editors-on-a-page-of-their-own) bound to the chat calls both.

`colorScheme` is the scheme the panel is drawn in now (`"light"` or `"dark"`); a change of the
`theme` attribute fires `ag-ui-theme` with `{ scheme }`. `locale` is the nearest `lang` attribute,
looked for past any shadow root the element is in, else the browser's language.
`tokenValues(names)` returns the values the panel computes for the custom properties `names` (a
colour resolved in the current scheme), leaving out any it does not declare. `./mcp-apps` hands a view the theme through these three.

## Sending from your own UI

`sendMessage(content, attachments?)` sends as if the user had typed it — user bubble,
`ag-ui-submit` event, run started. `ag-ui-submit` means a turn was sent, not that a run started:
a Retry and a run continued from the checkpoint panel start runs without one. To know whether
anything is running, read [`running`](header-and-panel.md#driving-the-conversation-from-your-own-chrome) or style on
`data-running`. Use it for an "Ask about this order" button, a command
palette, a prompt fired when your page mounts the chat, or a composer of your own replacing the
built-in one.

It returns a `Promise<boolean>`. It resolves `true` once the turn has been handed to the agent
and its run has settled, frontend-tool rounds included, and `false` when nothing was sent:

- for an entirely empty message;
- while a run, or a checkpoint continuation picked from the panel, is in flight. A continuation
  counts from the pick, and a send from the call rather than from when its run starts, so a
  `sendMessage` from an `ag-ui-submit` listener, or a second call in the same task, is refused
  rather than starting a second run;
- with no `endpoint` set, which the transcript also says;
- while a reload resumes a run a navigating tool interrupted. The resume counts from the moment
  the element asks its conversation store for the conversation, and it ends by starting that
  run, so a send then is refused, and the built-in Send queues behind the resumed answer;
- when your own code that runs on the way to the request — an `ag-ui-submit` listener, the
  conversation store's save — stops it by starting a new chat or changing `user-key`. A
  `getContext` or `getTools` that does the same stops it too, but after the turn was handed
  over, so the call resolves `true`.

**While the element restores a stored conversation, a send waits for it.** Every restore —
when the element connects, on `reload()`, when a thread is picked from the drawer, and when
`user-key` changes from one principal to another — first asks the conversation store for the conversation, and with
`data-threads-url` that is a request to your server. A `sendMessage` made in that time waits
until the conversation is drawn, then sends with it: the bubble, the `ag-ui-submit` event and the
request all come after the replay, later than the call by the length of the load. So a prompt
fired on mount needs no timing of its own. If New chat, a thread switch, a change from one
`user-key` to another or a `reload()` comes while it waits, the conversation it was addressed
to is gone, so it is dropped and resolves `false` at once. The element leaving the page drops it
too, but it resolves `false` only once the load answers or the element is inserted again. A
first `user-key` on an anonymous conversation adopts that conversation rather than replacing
it, so a send waiting then still goes out. A second `sendMessage` while one waits is refused. The built-in Send queues what is typed during the load ("Waiting to send"),
and sends it after the conversation is drawn, behind a `sendMessage` that was waiting.

Unlike the built-in Send it does **not** queue, so your composer keeps what it tried to send, and
it does **not** consult the attachment tray: what you pass is what is sent, so your composer stays
in charge of its own state.

`retryLastTurn()` keeps the same rules, because it starts a run on the same conversation. It
returns `false` while a run, a send, another Retry or a continuation is in flight, and while
any restore of the stored conversation is still loading. It does not wait for the load as a send
does: until the conversation is drawn there is nothing on screen to retry, and afterwards it
would ask the previous visit's last question again. It counts from the call as a send does: until its run starts, a `sendMessage` or a
second Retry is refused, the built-in Send queues, and a checkpoint pick is refused. It also
returns `false` when your own code stops it before its run starts: a conversation store, or an
activity or tool renderer it redraws through, that starts a new chat or changes `user-key`. A
`getContext` or `getTools` that does the same stops it too, before anything is sent, but it runs
after the Retry has handed its turn to the client, so the call resolves `true`. A store that
throws from the Retry's save leaves the conversation as it was, and `retryLastTurn()` rejects
with its error.

`attachFile(file)` queues a file into the tray exactly as the picker and drag-and-drop do, with
the same validation and progress chip. It returns `false` when uploads are not configured
(no `data-attachments-url` and no `uploadHandler`) — the only way to tell, since with no tray
there is nothing to report through.

Uploading is asynchronous, so watch `ag-ui-attachments` for the result. Its `detail` carries
`{ attachments, pending }`: the durable refs of everything that has finished, and how many are
still in flight. Send once `pending` is `0`, or you will leave files behind.

```js
chat.addEventListener("ag-ui-attachments", (e) => {
  const { attachments, pending } = e.detail;
  sendButton.disabled = pending > 0;
  sendButton.onclick = () => chat.sendMessage(input.value, attachments);
});
chat.attachFile(fileInput.files[0]);
```

## Starting a run with forwarded props

`run({ forwardedProps, runId?, message? })` starts a run for an action the server reads from
`RunAgentInput.forwardedProps` rather than from a typed turn, such as what the user picked on a
surface an activity drew.

```js
await chat.run({
  forwardedProps: { action: "approve", surface: "s1" },
  runId: actionRunId,
  message: { id: `${actionRunId}-turn`, content: "Approve the refund" },
});
```

- **Only the first request carries `forwardedProps` and `runId`.** `runId` reaches the wire
  unchanged, so you can derive ids from it. The rounds a frontend tool or an approval starts
  afterwards send `{}` and a run id of their own, because a server that acts on the props would
  otherwise act again for every round. Under [`data-detach-runs`](concepts.md#runs-that-outlive-their-connection)
  every round's `forwardedProps` also carries `detach: true`, and the later rounds send that alone.
- **`message` is the turn the server stores, under your `id`.** It is drawn as the user's bubble
  and announced by `ag-ui-submit`, as a `sendMessage` turn is, but it is not in the first
  request's `messages`, which would put it in the conversation twice. When that request's
  `RUN_STARTED` arrives, the turn joins the element's copy of the conversation, after the history
  that request posted and before the reply. From then on every request posts it, the follow-up
  rounds of the same run included, and the store saves it, so a reload draws it again. A run
  refused before `RUN_STARTED` keeps nothing. Without `message`, nothing is drawn or announced.
  A `message` with empty content is refused.
- **It refuses and waits as `sendMessage` does.** It resolves `false` while a run, a send or a
  picked checkpoint's continuation is in flight, and with no `endpoint`. Behind a restore it waits,
  then runs. It resolves `true` once the run is handed to the client.
- **Retry asks for a refused action again, unchanged.** When the first request is refused before
  `RUN_STARTED`, the failed bubble's Retry (and `retryLastTurn()`) sends the same `forwardedProps`,
  the same `runId` and no `message` in `messages`, and redraws the turn once rather than adding a
  second bubble. Once `RUN_STARTED` arrives the server holds the action, so Retry is withdrawn,
  from the earlier answer too, and `retryLastTurn()` resolves `false` without touching the
  conversation; so it does after a Stop. The next `sendMessage` or checkpoint continuation brings
  Retry back, and New chat, a thread switch or a reload forgets the action: a restored
  conversation's Retry re-asks its last user turn, the action's included, as a sent one.

## Adding to every run's context

`registerContext(provider)` adds entries to every run's context beside `getContext` rather than
in place of it, and returns the function that removes them again:

```js
const unregister = chat.registerContext(() => [
  { description: "open_surface", value: JSON.stringify(surface.state) },
]);
// later
unregister();
```

Each round's context is what `getContext` returns, then each registered provider's entries in
registration order, then the place. Providers are read fresh for every round, a checkpoint
continuation's included, and are filtered like `getContext`'s while the place is withheld. Use it
when a piece of your page has something to say for as long as it is on screen, without taking
`getContext` over from whatever else set it.

A self-contained demo lives in [`demo/`](https://github.com/Artui/agents-web-components/tree/main/demo/). Run `make demo` from a clean checkout: it
installs, builds and serves the demo against a scripted AG-UI server on port 5173. Every feature
has its own scenario page, grouped in the left nav; each page has the controls for that feature
and **Try** buttons that send the prompts the scripted agent answers. The start page lists every
prompt, and `/page/` is the chat as a host's own full-page route.
