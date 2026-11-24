# Core concepts

## The run loop and the AG-UI client

`<ag-ui-chat>` is the view; [`AgUiClient`](https://github.com/Artui/agents-web-components/blob/main/src/core/agui_client.ts) is the orchestration layer over
an AG-UI `AbstractAgent`. On the first send the element builds a client (via the overridable
`agentFactory`, which defaults to [`createHttpAgent`](https://github.com/Artui/agents-web-components/blob/main/src/core/create_http_agent.ts)). Each turn:

1. The user message is appended and the agent runs once.
2. AG-UI subscriber events are translated into the element's handlers — streaming text deltas
   render into a bubble; each `TOOL_CALL_END` becomes a tool-call card.
3. Any **frontend** tool calls collected during the run are executed locally, their results are
   appended as `tool` messages, and the agent is re-run with the results.
4. This repeats until the agent stops calling frontend tools, bounded by `MAX_TOOL_ROUNDS`
   (10) — raise it with `data-max-tool-rounds`, or `AgUiClientConfig.maxToolRounds` when you
   drive the client yourself. The default suits a chat whose tools answer questions; a
   page-driving deployment reaches it legitimately, one round per field filled, and the symptom
   is not an error but an answer that stops mid-task. A value below 1 is ignored rather than
   honoured — it would be a send that never runs the agent at all.

Tool calls the client doesn't own (server-side tools the server already executed) are left alone —
the loop doesn't re-run them, but their streamed `TOOL_CALL_RESULT` is rendered into the tool-call
card (honouring `data-tool-display`), so server-side output is visible too. The current tool catalog
and context are read **fresh on every run** (`getTools()` / `getContext()`), so they always reflect
the current page state.

### A tool call that failed

A `TOOL_CALL_RESULT` may say how the call ended, as an optional **`outcome`** key in the event's
`metadata` (`"metadata": { "outcome": "failed" }`). It takes pydantic-ai's own `ToolReturnPart`
vocabulary — read the values off `TOOL_OUTCOME`:

| `outcome` | Card | Means |
| --- | --- | --- |
| *(absent)* | done | A result, said the way every server has always said it. |
| `success` | done | The same thing, stated. |
| `failed` | error | The call ran and failed. |
| `denied` | declined | A person or a guard refused it, so it never ran. |
| `interrupted` | not finished | It produced no result because the run ended first, and nobody refused it. |

**Absent is a success, and anything unrecognised is too** — including a value from a later protocol
version. A card is a claim about what happened, and refusing to
recognise a word is not grounds for claiming failure. So no server has to change to keep the
rendering it has today, and a server that adds the field gets the truth on screen instead of a
green card with a refusal folded inside it.

It has to be in `metadata`. `@ag-ui/client` 1.0 strips every key its schemas do not declare from an
event before any subscriber sees it, with a `[ag-ui][enforce]` console warning, and `metadata` is
the one place on an event it declares open by key. An `outcome` at the top level of the event —
where a server wrote it for the 0.x client, and where a django-ag-ui older than 0.63.0 still does —
never arrives, so the card settles as done. The key arrives on `AgUiClientHandlers.onToolResult` as
an optional third argument, typed `unknown` because the protocol validates nothing inside
`metadata`; `toolStatusFromOutcome` does the narrowing.

A **frontend** tool never streams this event — the client posts its own result — so its outcome is
recorded on the `ToolExecution` the executor returns (`{ content, outcome: "denied" }`). That covers
the two refusals the component makes itself: a confirmation card the user declined, and a call
blocked because the page moved under the round.

Either way the outcome is **persisted on the tool message, in its `metadata`**, so a reload replays
the card as it settled rather than as a plain result. For a server's result `@ag-ui/client` puts it
there itself, folding the event's metadata onto the tool message it appends; for its own results the
client writes it in the same place. See
[MPA durability](durability.md#mpa-durability-surviving-full-page-reloads).

**Every request carries a result for every tool call in it.** Several model providers reject a
turn holding a tool call with no result, and a run can leave one open in more ways than one: Stop
while the stream is still arriving, a round that ends on `RUN_ERROR`, a call naming a tool nothing
here owns, a server that never streamed the result. So before each request the client answers
every call still open with the `callNotFinished` string (by default `Not finished: the run ended
or moved on before this tool call returned a result.`) and the outcome `interrupted`, placed at the
end of the round that made the call, and the card settles to **not finished** in the same words.
That result blames nobody, because nobody declined: `declinedAction` is kept for a call a person
was asked about and turned down — a confirmation card or an approval they declined, or one Stop
closed while it was open. The calls a resumed approval is answering are left alone, because the
resume is their answer.

The catalog a run advertises is also the set that run can execute. Override `getTools` to scope
what a page offers — say, exposing `delete_record` only where deleting makes sense — and a call
naming a tool you withheld is treated exactly as a call naming a tool you never registered: no
handler runs, the card settles as not finished, and the next request answers the call in those
words. Withholding is per run, so the
mount-wide registry can stay complete. Hosts that leave `getTools` alone advertise the built-ins
plus everything registered, which is precisely what dispatch could reach anyway.

## Stopping a run

While a run is in flight the **Send button becomes Stop** (same button, label/`aria-label` swap,
`data-state="running"` for styling); clicking it — or pressing **Escape** in the composer (when
the skills palette is closed; the palette owns Escape while open) — calls `AgUiClient.cancel()`.
AG-UI has no server-side cancel route: cancelling **aborts the streaming request**
(`abortRun()`), and the server observes the disconnect. On cancel:

- Partial assistant text already streamed **stays in the transcript** and is persisted via
  `onPersist`, so a reload shows the truncated exchange. A muted **"⏹ Stopped"** note is appended
  (`.stopped-note`) — a deliberate stop is not an error, so no bubble.
- The run loop stops: tool calls collected before the abort are **not executed**, and no further
  round starts. A frontend tool handler already running completes and its result is kept, but it
  doesn't trigger a re-run, and the calls after it in the same round do not start. Each call that
  did not run settles as **not finished**, and the next request answers
  it in those words rather than sending it without a result.
- An **open confirmation card is declined** (`data-resolved="declined"`) — cancelling the run
  answers the pending question. Likewise an open **approval card** is denied, and the next request
  carries that decline as the call's result; a call already approved when Stop lands was declined
  by nobody, so it is answered as not finished instead. An open **question card** (`ask_user`)
  resolves with an empty answer. Reloading the page while a card is open does not decline it,
  because nobody answered: the call comes back not finished; see
  [MPA durability](durability.md#mpa-durability-surviving-full-page-reloads).
- The new `onCancelled()` handler fires instead of `onError()`; `onSettled()` still follows
  (the terminal-rest guarantee), returning the button to **Send**.

`cancel()` with no run in flight is a safe no-op. `newChat()` cancels any in-flight run before
discarding the client, and so do switching conversations, `reload()` and removing the element. A
[checkpoint continuation](durability.md#resuming-a-run) is the run in flight while it lasts, so Stop and all of
these end it too. So does a turn that has not made its request yet: called from host code a send
or a resume runs on the way — the conversation store's save, `getContext`, `getTools` —
`cancel()` stops it before anything is sent, and `onCancelled()` and `onSettled()` fire as for any
other Stop.

A cancelled run ends a moment later, once its request has closed or a running tool handler has
returned. What it does then stays with the conversation it belonged to: its truncated exchange is
saved to that thread, `ag-ui-run-finished` still reports the tools it ran, and nothing reaches the
transcript or the Stop button of the conversation that replaced it.

With [`data-detach-runs`](#runs-that-outlive-their-connection), Stop, Escape and deleting the
thread on screen also post the thread's `cancel/`; switching, New chat, `reload()`, a `user-key`
change and removing the element still only abort the request, and the run carries on.

## Runs that outlive their connection

By default a run lives inside its request: switching thread, New chat or removing the element
aborts it, and the server cancels it. With a django-ag-ui **0.82.0+** mount that has a run store,
a run can ask to carry on instead. Opt in on the element:

```html
<ag-ui-chat endpoint="/agent/" data-threads-url="/agent/threads/" data-detach-runs></ag-ui-chat>
```

or `chat.detachRuns = true`. Both are read at each request, and both need `data-threads-url`:
the element reaches the run's log and cancel route beside it, at `<url><id>/events/` and
`<url><id>/cancel/`, and does nothing extra without it. The server honours the request only on a
mount with `run_store=` and `RUN_TIMEOUT_SECONDS` set, served over **ASGI**, to an
**authenticated** user; anywhere else the run is cancelled on disconnect as before. Then:

- **Every request asks to detach.** `RunAgentInput.forwardedProps.detach` is `true` on every round
  of a turn, a frontend tool's rounds included, so leaving during one leaves it running too.
- **Leaving lets go.** A thread switch, New chat, `reload()`, a `user-key` change and the element
  leaving the page abort the request locally; the server sees a disconnect, the run finishes,
  and no cancel is recorded.
- **Coming back joins the run.** Restoring a thread (picking it, the first load, a reload, the
  element being inserted again) asks the server once whether it has a run going: a JSON
  `GET <url><id>/events/?after=0&limit=1`, reattaching when its `status` is `"running"`. A `404`
  or any other status restores the thread from its store as before. It is asked rather than
  remembered so it holds across an element a tab host unmounted; there is no status on the thread
  list yet. Joining replays the run from its start (`events/?after=0` as an AG-UI stream), so the
  transcript is redrawn from the replay's opening `MESSAGES_SNAPSHOT` and the answer streams in
  as a live one does. `running` (and `data-running`) is true from the moment the run is joined
  until it ends, so a host that defers a switch until a run is over can key on its removal. A
  host's `sendMessage()` made while that restore is in flight waits for the joined run to end and
  then goes out, ahead of any turn the composer parked; a Stop during the joined run drops it
  (`false`).
- **Stop asks the server.** Stop, Escape and deleting the thread on screen post
  `<url><id>/cancel/` with the element's headers and credentials, then abort as before. The run
  acts on it at its next lease renewal, about ten seconds on; a `404` means it had already ended
  and is not reported.
- **A start on a busy thread joins the busy run.** A send the server refuses with `409` because
  another run holds the thread (a Stop's cancel has not landed yet, or a second tab) joins that run
  instead, and the turn waits in the composer's queue, attachments included, sent once that run
  has ended (a turn that is only files is shown by their names); a refused `run()` action is not
  sent again. The server logs a run's end a moment before it lets go of the thread, so a turn
  refused by the very run it just waited out is asked once more, a quarter second later, and a
  second refusal is shown as the error.
- **A queued mount's start is followed.** A mount with a `firing_queue=` (django-ag-ui 0.82.0+)
  answers a detached start with `200 {"thread_id", "run_id"}` and leaves the run to a worker; the
  element then reads that run through `events/?after=0` and streams it as it would have streamed
  the start, each frontend-tool round alike. The replay's opening snapshot is the stored
  conversation, without the turn just sent, so it is not applied.
- **The run routes follow `data-threads-url`.** A replay and a cancel read the attribute when they
  are made, so a host that sets or changes it after the element connected sends the next of each
  to the new URL; the thread list and its store still read it while connecting.

Reattaching needs an agent that can connect: the default `agentFactory` builds one. A factory
returning an agent that does not override `connect` gets the store-only restore. A factory that
wraps `createHttpAgent` passes `getEventsUrl` on with the rest of the options, which is how the
late attribute reaches the default agent; `getEventsUrl` wins over `eventsUrl`, so a factory that
points the run log elsewhere overrides `getEventsUrl`.

## A run the server stops

A `RUN_FINISHED` whose outcome is `cancelled` is a run the server stopped, and it ends exactly as
Stop does: the partial answer stays and is saved, the muted **Stopped** note is appended,
`onCancelled()` fires instead of a finish (then `onSettled()`), tool calls the run streamed are
not executed and settle as not finished, no usage line is drawn, and `ag-ui-run-finished` reports
`outcome: "stopped"`. It is not a failure, so there is no bubble and no Retry. The event does
not say why the server stopped, so the note does not either.

Where it comes from: django-ag-ui streams through pydantic-ai's AG-UI adapter, which sends this
outcome when the run ends in pydantic-ai's own cancellation (`RunCancelled`): the agent's code
calling `RunContext.cancel()`, or a run deadline passing, which pydantic-ai raises as
`RunTimedOut`, itself a cancellation. django-ag-ui sets no run deadline and cancels no run
itself today, so on its own it never sends the outcome; an agent or a deadline the host adds
does. The adapter sends it only to a client that declares AG-UI 1.0 on
`RunAgentInput.protocolVersion`, which `@ag-ui/client` 1.0 does on every request; an older
client gets a bare `RUN_FINISHED` and reads a finish. When you press Stop the server sees the
request close and sends nothing, so the two never meet.

## When a run fails, and what it cost

A run that ends in `RUN_ERROR` draws a failed bubble with Retry. Its words come from the event's
`code` (the server's, or `abort`, which `@ag-ui/client` sets when something other than Stop cuts
the connection), each a key of the strings table:

| `code` | The bubble says |
| --- | --- |
| `timed_out` | `runErrorTimedOut` |
| `interrupted` | `runErrorInterrupted` |
| `identifier_too_long` | The server's own message, which names the field and the limit, and an offer (`runErrorNewChat`, part `run-error-offer`) that starts a new conversation, as New chat does |
| `error`, or any other code | `runErrorFailed` |
| none | The server's message, as before codes existed |

Where a code is known, the server's message is not shown: django-ag-ui redacts it unless told not
to, and a code is the part a client can put words to. A server that sends no code never promised
that, so its message is kept.

A run POST the server refuses before any event arrives reads the same table when its body is
JSON with a string `code`: django-ag-ui answers an over-long thread or run id with a 400 whose
body is `{"error": <message>, "code": "identifier_too_long"}`, which draws the server's `error`
message and the new-conversation offer, exactly as the `RUN_ERROR` would. `onError` receives the
code in `RunErrorInfo` either way. A refusal with no `code`, or a body not sent as `application/json`, and a
stream that drops, show the client's own error text, for example `HTTP 400: {"detail": ...}`,
with no offer.

With `show-usage` set, a finished turn ends with a muted line such as `1,234 in · 567 out
tokens` (part `usage-line`), the sums of `inputTokens` and `outputTokens` over every usage entry
of every round in the turn. A side no entry carried is left out (`usageInput`, `usageOutput`);
a turn with no usage, a failed turn and a stopped one (by you or by the server) draw nothing. The line is not stored, so a conversation restored from history has none. The digits
are grouped with commas whatever the locale; the three templates take `{input}` and
`{output}`.

## Registering tools

A tool is a `ClientTool`: `{ name, description, parameters, handler }`, where `parameters` is a
**JSON Schema** and `handler` receives the parsed args and returns a value that is JSON-serialised
into the tool-result message. Register them on the element:

```js
chat.registerTool({
  name: "search_products",
  description: "Search the catalog.",
  parameters: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
  handler: async ({ query }) => await api.search(query),
});
```

Registering a name twice replaces the earlier handler rather than throwing, so a re-fired
host ref or React StrictMode's double-invoke is harmless -- but two different tools sharing
a name means the second silently wins. Each `<ag-ui-chat>` element owns its own
registry, AG-UI client, and Shadow DOM, so **multiple instances on one page never interfere**.
The one record they share is which storage namespace each has claimed, and it exists to keep two
of them out of each other's conversation.

**A handler's thrown message leaves the browser.** If a handler rejects, its `Error.message` is
posted back as that call's tool result: into the conversation, on to the AG-UI endpoint, persisted
there, and replayed to the model provider on every later round. That is deliberate — a real reason
is what lets the agent recover — but it means an internal hostname, a signed URL or a
stack-derived path in a rethrown error is disclosed to parties you never chose. Throw the message
you would be content for the model to read, and log the detail instead.

## Inline confirmation (`x-destructive` / `x-confirm` / `confirmPredicate`)

When a tool call needs confirmation, the element appends an **inline confirmation card** (a
`<div class="confirm">`) to the transcript via
[`requestConfirmation`](https://github.com/Artui/agents-web-components/blob/main/src/ui/confirmation_card.ts) — it is not a modal overlay. The card reads
naturally after the assistant's explanation, never steals focus from the page, and stays in the
transcript as a resolved record after the decision:

- **Confirm** → the handler runs and the result is posted back.
- **Cancel** → a `"User declined the action."` result is posted; the agent acknowledges on its
  next turn.
- **Always allow** → the handler runs *and* this tool stops prompting for the rest of the
  session. See below for when this button appears.

Whether a call is gated is decided in this order:

1. If `chat.autoConfirm === true`, the call **never** prompts (an "autopilot" toggle).
2. Else if `chat.confirmPredicate` is set, its boolean return is authoritative — given the tool
   name + parsed args it decides per-call (so one tool can be instant for some args and confirmed
   for others, which a static flag can't express). **A predicate that throws or rejects refuses
   the call**: no card, the handler does not run, the tool card settles as declined, and the agent
   gets the `confirmCheckFailed` string as the result and carries on, as after a decline. The
   error goes to the console, never to the endpoint. A predicate still pending when the run is
   stopped decides nothing: the call does not run, and its card settles as not finished.
3. Else if the user has waived this tool name for the session, the call runs.
4. Else the element falls back to [`isDestructive(parameters)`](https://github.com/Artui/agents-web-components/blob/main/src/tools/is_destructive.ts),
   which reads the `x-destructive` JSON-Schema flag.

### "Always allow", and why only sometimes

A prompt that is approved nearly every time is not a decision, it is a speed bump — and the
reflex it trains is what makes the rare refusal easy to miss. Anthropic published that users
approve **~93%** of Claude Code permission prompts manually and called interactive confirmation
*"behaviorally unreliable as a sole safety mechanism"* on that basis. The waiver exists so the
prompts that remain still mean something.

**The button is offered only on cards raised by step 4** — the `x-destructive` default. Where
`confirmPredicate` is what gated the call, there is no button, because that predicate is
documented as authoritative and letting one click retire it would silently defeat a host policy.
The offer and the allowlist sit on the same path, so there is no dead button either.

The waiver is **per tool name and per element**, held in memory and never persisted. A session
decision that outlived the tab would be a permanent grant made by one click — which is what
`autoConfirm` already exists to say deliberately. It is cleared when the element goes away, and
when [`user-key`](durability.md#who-the-stored-conversation-belongs-to-user-key) changes hands: one person's
*Always allow* is not the next person's, and a sign-out in the same tab does not remount anything.
The first key to arrive keeps it, for the same reason it keeps the conversation.

AG-UI has no built-in risk flag, so destructiveness is carried as a JSON-Schema extension at the
**schema root**: `parameters["x-destructive"] = true` (use the exported `X_DESTRUCTIVE_KEY`
constant). There is no parallel metadata channel and no name heuristic — destructiveness is exactly
the `x-destructive` flag (or `confirmPredicate`). The registry forwards the flag verbatim to
`RunAgentInput.tools`.

If the schema carries an `x-confirm` string (use `X_CONFIRM_KEY`), the card shows it as the prompt;
otherwise it falls back to a generic `Run "<tool>"?`.

**This gate covers frontend tools only.** A server-side tool's schema never reaches the browser —
tool definitions travel client-to-server on `RunAgentInput.tools`, and the only channel coming back
is the label catalog (`data-tools-url`), which carries `{ name, summary, description? }` and no
flags. So marking a server tool destructive does not produce a card here; gate it server-side
instead (see [Server-side tool approval](#server-side-tool-approval-interrupts)), which surfaces as
an approval card in the same transcript.

```js
// Per-call: confirm a delete only when it would remove more than one row.
chat.confirmPredicate = (name, args) =>
  name === "delete_rows" && Array.isArray(args.ids) && args.ids.length > 1;

// Prompt text via x-confirm:
chat.registerTool({
  name: "activate_project",
  description: "Activate the current project.",
  parameters: { type: "object", properties: {}, [X_DESTRUCTIVE_KEY]: true, [X_CONFIRM_KEY]: "Activate this project?" },
  handler: async () => await api.activate(),
});
```

The confirmation card gates **client-registered** tools *before* they run. A **server-side**
tool runs on the server, so the browser can't intercept it the same way — that is what the
approval card below is for.

## Server-side tool approval (interrupts)

When the server gates a destructive tool (e.g. django-ag-ui's `ToolGuard`), the tool **defers**
instead of executing and the run finishes on an AG-UI *interrupt*. The element then renders an
**inline approval card** (a `<div class="approval">`) via
[`requestApproval`](https://github.com/Artui/agents-web-components/blob/main/src/ui/approval_card.ts) **inside the tool card of the call it gates**:

- **Approve** → the run resumes and the server runs the tool; its result streams back into the
  same card.
- **Deny** → the run resumes carrying a `cancelled` answer, so the model learns the tool was
  declined; the card settles as declined.

This uses the AG-UI protocol's own interrupt/resume mechanism (`RunAgentInput.resume[]`) — the
wire stays vanilla AG-UI. A **Stop** while an approval card is open denies every open card and
cancels the run. No configuration is needed on the client; the gate is enabled server-side.

**A run can defer several calls, and each is answered on its own.** Importing three rows defers
three `create_event` calls, and the wire takes a different answer for each. So every question is
asked **at once**, each in its own tool card, above that call's own arguments — which is what says
*which* call it is about. The prompt cannot: it comes from the tool, so all three read "Add this
event to the board?". While the run waits, those cards read **`waiting for you`**
(`data-status="deferred"`), not "running…" — nothing is running, the stream is over and the server
is idle. A card asking a question shows its arguments in every `data-tool-display` mode, since
hiding them would hide the answer to "which one is this".

A **frontend** tool such as `ask_user` stays at "running…" while its card is open, because the
browser really is running it. Only a deferred call was claiming something untrue.

**What the card asks.** An AG-UI interrupt carries the question as `message`, and the default is the
call spelled out — `Approve create_event({"title": "Design sync", …})?` — which is accurate and not
something to put in front of a person. A server can supply its own wording as **`x-confirm` in the
interrupt's `metadata`**, the same key a client-side confirmation reads off the tool's schema, and
the card prefers it:

```json
{ "id": "int-1", "reason": "tool_call", "toolCallId": "call-1",
  "message": "Approve create_event({\"title\": \"Design sync\"})?",
  "metadata": { "x-confirm": "Book Design sync on Friday at 14:00?" } }
```

Anything non-string or blank under that key is ignored in favour of `message`, and with neither the
card falls back to `strings.approvalPrompt`.

**The card approves or denies, and nothing else.** The interrupt's `responseSchema` also advertises
`editedArgs` and `reason` — the protocol allows a client to rewrite a gated call's arguments before
letting it run. The built-in card does not offer that; a host that wants it can implement
`approvalRenderer` and resolve the interrupt itself.

**A gated write is still a write the page cannot see.** Approving one runs a *server-side* tool, so
if your page renders the data it touched, listen for
[`ag-ui-run-finished`](host-seams.md#host-seams-the-spa-story) and refetch.

Like the question card, the approval card is customizable at three levels: **text** (`strings`:
`approveAction` / `approvalPrompt` / `approve` / `deny` / `toolDeferred`), **CSS** (`::part()`:
`approval`, `approval-body`, `approval-actions`, `approval-button`, `approval-approve`,
`approval-deny`, and `tool-card-approval` for the region inside the card), and **full replacement**
via `chat.approvalRenderer` — given the request (`message` + `toolName`) and a Stop `AbortSignal`,
render your own UI and resolve `true`/`false`. A renderer is called **once per interrupt,
concurrently**, so a host that can only ask one thing at a time should queue inside it:

```js
chat.approvalRenderer = (request, { signal }) =>
  myConfirmDialog(request.message ?? `Run ${request.toolName}?`, { signal });
```

**A renderer that throws or rejects falls back to the built-in card** for that interrupt, with a
`console.warn` naming it. The renderer decides how the question looks, not whether it is asked, so
nothing runs without a click and the run carries on as if no renderer were set. The one exception
is a rejection after the signal fired, which is how a renderer is expected to honour Stop: that
wait resolves as denied, as the built-in card does on the same signal, with no card and no warning.

## Asking the user a question (`ask_user`)

Set `chat.askUser = true` to offer the agent a built-in `ask_user` frontend tool. When the agent
calls it, the element renders an **inline question card** (a `<div class="question">`) via
[`requestQuestion`](https://github.com/Artui/agents-web-components/blob/main/src/ui/question_card.ts) and returns the user's answer as the tool result:

```js
chat.askUser = true; // opt in; off by default so the tool catalog is unchanged otherwise
```

`ask_user(question, options?, allow_custom?)` renders `options` as radio buttons, adds a free-text
field when `allow_custom` is set (or when no options are given), and feeds the chosen or typed
answer back through the normal frontend-tool path — no new protocol. A **Stop** dismisses an open
question with an empty answer.

The question card is **fully customizable** at three levels:

- **Text** — every label is a `strings` key: `askUserAction` (the card's `aria-label`),
  `otherOption`, `answerPlaceholder`, `submit`.
- **CSS** — every element exposes a `::part()`: `question`, `question-body`, `question-options`,
  `question-choice`, `question-radio`, `question-input`, `question-actions`, `question-button`
  (plus the `--ag-ui-*` theme variables). No shadow piercing.
- **Full replacement** — set `chat.askUserRenderer` to own the entire UI. Given the parsed request
  and an `AbortSignal` (fired on Stop), render anything — a native modal, a framework component —
  and resolve with the answer (empty string = no answer). The built-in card is bypassed entirely.

```js
// Level 1+2: restyle the built-in card.
chat.strings = { submit: "Answer", answerPlaceholder: "Type here…" };
// ag-ui-chat::part(question) { border-radius: 0; }

// Level 3: replace the card with your own UI.
chat.askUserRenderer = (request, { signal }) =>
  myModal.ask(request.question, request.options, { allowCustom: request.allowCustom, signal });
```

**A renderer that throws or rejects falls back to the built-in card** for that call, with a
`console.warn` naming the tool call. As with `approvalRenderer`, the renderer decides how the
question looks, not whether it is asked, so the run carries on as if no renderer were set. The one
exception is a rejection after the signal fired, which is how a renderer is expected to honour Stop:
that wait resolves with an empty answer, as the built-in card does on the same signal, with no card
and no warning.

## DOM-driver and animation primitives

So the agent can visibly drive the host page, the package ships generic, framework-free
primitives. The **animation** primitives ([`animations.ts`](https://github.com/Artui/agents-web-components/blob/main/src/dom/animations.ts)) operate at
human-readable speed (configurable; pass small/zero durations in tests):

- `typeInto(el, value, { charDelayMs })` — clears and types a value character by character,
  firing `input`/`change` events as a real user would.
- `highlightThenClick(el, { highlightMs })` / `pressThenClick(el, options)` — outline/press an
  element, pause, then click.
- `selectOption(el, value)` / `toggleControl(el, checked)` — animate a `<select>` / checkbox.
- `scrollIntoCenterView(el, { settleMs })` — scrolls the element to the vertical centre and
  resolves once the scroll has **settled**, so the ring that follows is drawn where the user is
  looking rather than mid-glide. Awaiting is optional; the scroll is requested synchronously
  either way. Settlement is `scrollend` where the browser has it, a short probe when nothing
  actually moved (the element was already in view), and a 600 ms cap otherwise.
- `flash(el, { flashMs, color })` / `focusWithFlash(el, { flashMs, color, focus })` — ring the
  element so the user can find it. The ring is an `outline`, not a `box-shadow`, because a shadow
  paints outside the border box and any `overflow: hidden` ancestor sharing the element's box (a
  card, a table cell) clips it away entirely. It holds for **1200 ms** by default and fades out
  over the last third — a 200 ms blink is not long enough to be *found* by someone who does not
  yet know where to look. The colour is `color` when passed, else — see
  [Ring colour](#ring-colour) — the widget's own accent.
  `flash` leaves focus alone; `focusWithFlash` moves it — see "Flash versus focus" below.
- `prefersReducedMotion()` — honoured by every primitive that *moves* something: the hold delays
  in `pressThenClick` / `selectOption` / `toggleControl` collapse to instant, `scrollIntoCenterView`
  jumps instead of gliding and settles immediately, and the flash drops its fade while still
  holding the ring for its full duration. Reduced motion asks for no animation, not for no
  feedback. `typeInto` and `highlightThenClick` are the exceptions: they keep their
  explicit-duration contract, so pass `charDelayMs: 0` / `highlightMs: 0` yourself if you want
  them instant.

The **DOM-driver** primitives ([`dom_driver.ts`](https://github.com/Artui/agents-web-components/blob/main/src/dom/dom_driver.ts)) compose those into the
operations a tool handler typically wants:

- `fillField(el, value, options)` — scroll to, focus-flash, and type into a text field. The
  flash defaults to `flashMs: 0` here: the field is about to be typed into, which is its own
  highlight. Pass `flashMs` (and optionally `color`) to ring it first.
- `clickElement(el, options)` / `pressButton(el, options)` — scroll to, highlight/press, and click.
- `showHighlightOverlay(el, options)` — ring an element from an **overlay drawn outside it**, and
  optionally dim everything else (`scrim`) or flow a gradient round it (`gradient`). Returns a
  function that removes it. `flash` and `focusWithFlash` take `scrim` and `gradient` too and route
  through this when either is asked for.

  **Why a second mechanism.** The plain ring is an `outline` on the element, which is deliberate:
  a `box-shadow` paints outside the border box, so an `overflow: hidden` ancestor sharing the
  target's box clips the whole ring away while the helper still reports success. But an outline
  takes a *colour* — there is no `outline-image` — so a gradient cannot be one, and anything else
  that can be is a property of the target and lands back inside whatever is clipping it. Dimming
  everything else needs a surface larger than the target, which is the same problem from the other
  side. So they are one overlay rather than two features.

  **It is inert.** The overlay never takes a pointer event, at the cut-out or anywhere else — a dim
  that swallows clicks is a modal the user did not open, and `highlightThenClick` has to reach the
  control it just finished pointing at. It follows the target on scroll and resize, and under
  reduced motion the gradient is drawn but does not travel.

  **Themed from the element you point at, not from the widget.** The overlay is appended to the
  document body so it can escape the clipping it exists to avoid, which means a `var()` in its own
  style would resolve against the body — so every token is read from the *target's* computed style
  instead. Set them wherever they inherit to the elements the agent touches, usually `:root`. The
  ring colour is the one exception, read from the widget as well; see
  [Ring colour](#ring-colour).

  ```css
  :root {
    --ag-ui-highlight-ring-color: #0f766e; /* also read from ag-ui-chat; see Ring colour */
    --ag-ui-highlight-scrim: rgba(15, 15, 25, 0.45);
    --ag-ui-highlight-gradient: linear-gradient(115deg, transparent 20%, #4f46e5 50%, transparent 80%);
    --ag-ui-highlight-ring-width: 3;    /* unitless; px */
    --ag-ui-highlight-flow-ms: 2400;    /* one pass of the gradient */
    --ag-ui-highlight-z-index: 2147483001;
  }
  ```

  `ringWidth` and `flowMs` options override the tokens per call; `color`, `padding` and `radius`
  have no token because they are per-target rather than per-theme. The overlay's own styles are
  inline and it lives in the light DOM, so neither a stylesheet rule nor `::part` can reach it —
  these tokens and options are the whole surface, which is why they cover every value it draws.
- `selectControl(el, value)` / `toggleCheckbox(el, checked)` — animate a `<select>` / checkbox.
- `setControlValue(el, value)` — set a `<select>` or checkbox without animation, dispatching
  `input`/`change`.

Every driver primitive **awaits the scroll** before it animates. A smooth scroll is not awaitable
on its own, so a highlight fired straight after `scrollIntoView` could be applied and removed
while the element was still travelling — visible to nobody. Budget up to ~600 ms of settle time
per action in a browser without `scrollend`; an element already in view costs ~100 ms.

**Flash versus focus.** `focusWithFlash` does what its name says: it moves keyboard focus. That is
rarely what you want just to *point at* something — it takes focus off the composer, can fire blur
validation on whatever the user was mid-edit in, and can close an open menu. Reach for `flash(el)`
to highlight, and keep `focusWithFlash(el)` for the case where the agent is about to type. Either
way you can be explicit with `focus`:

```js
await flash(el);                            // highlight, focus untouched
await focusWithFlash(el);                   // highlight and take focus
await focusWithFlash(el, { focus: false }); // same as flash(el)
```

`focusWithFlash` focuses with `preventScroll: true`, so it cannot fight a smooth scroll that is
still in flight.

The native-setter helpers ([`native_setter.ts`](https://github.com/Artui/agents-web-components/blob/main/src/dom/native_setter.ts)) — `setNativeValue` /
`setNativeChecked` — set a control through its native prototype setter so React-controlled inputs
register the change.

Each takes an element the caller has already located; host packages wrap them with
environment-aware lookups (e.g. "find `#id_<name>`, then `fillField`").

### Ring colour

Every ring the driver draws — the flash outline, the overlay ring, the press and toggle halo — is
drawn in the host's page, outside the widget, so a token set on `ag-ui-chat` never reaches it
through the cascade. The driver reads the widget directly instead, so on a page that themes
nothing the rings follow the widget's theme: Quiet's near-black, Soft's violet, the dark half in a
dark scheme. When a call passes no `color`, the first of these that is set wins:

1. `--ag-ui-highlight-ring-color` on the target (so `:root` reaches every ring);
2. `--ag-ui-highlight-ring-color` on the chat — on `ag-ui-chat` or anything above it;
3. the target's `--ag-ui-accent`, so a page that themes its accent keeps the rings it has;
4. the chat's resolved accent, its theme's default included, held to 3:1 against the page (below);
5. the package indigo, when no chat is on the page at all.

The chat's own accent follows the widget's scheme, not the page's, so a dark widget's near-white
accent would all but vanish on a light page. When the ring falls to step 4 it is measured against
**the surface behind the target**: the background of the target's parent, and of each element
above it until one is opaque, composited over the page canvas (which follows the root's
`color-scheme`). The target's own fill is not that surface, because the ring is drawn outside its
box: a white field on a dark page is ringed on the dark page. Background images are not read. The
ring takes the first of these that holds 3:1 there (WCAG 2.4.13): the accent as the chat resolves
it, the other half of the chat's `light-dark()` pair, or the accent stepped toward black or white.
Steps 1 to 3 are a host's own choice and are drawn as given, contrast or not.

```css
/* Rings in the brand colour, whatever the widget's accent. */
ag-ui-chat { --ag-ui-highlight-ring-color: #0f766e; }
```

The halo of `pressThenClick` and `toggleControl` is the chosen colour at 40%. "The chat" is the
most recently connected `<ag-ui-chat>`; on a page with two, pass the one acting as the `chat`
option (`RingOwnerOptions`, which every ring-drawing primitive and `showHighlightOverlay` take).

## Page-action tools

Two built-in client tools let the agent perform common page interactions without every host
re-implementing them. They are **opt-in** via `data-page-actions` — a comma list of the tokens you
want — so you control the agent's interaction surface:

```html
<ag-ui-chat endpoint="/agent/" data-page-actions="scroll,drag"></ag-ui-chat>
```

- **`scroll_to`** — scroll a target into view. `target` is `"top"`, `"bottom"`, or a CSS selector
  / page-map element id. Read-only (no confirmation). It centres the target **vertically** and
  brings it into view **horizontally** (`inline: "nearest"`), so on a two-axis surface a
  horizontal target lands at the near edge rather than in the middle. In view is the contract;
  "centred" is not, in that axis.
- **`drag_and_drop`** — drag the `from` element onto the `to` element (selectors / page-map ids),
  firing the standard HTML5 drag sequence (`dragstart` → `dragenter`/`dragover`/`drop` → `dragend`)
  so the page's own drop handler reacts. Useful for reordering sortable lists.
- **`chat`** — four tools that let the agent move the panel it is speaking from:
  `read_chat_surface`, `move_chat`, `minimise_chat`, `restore_chat`.

  This is the one nobody else can offer. Every other assistant's chat is a surface of its own, so
  there is nothing for it to be in the way *of*; ours is mounted in the page the user is working
  in, which makes "let me move this aside so you can see the table" something the agent can act on
  rather than apologise for.

  **They report what happened, not what was asked.** A panel that fills the screen has nowhere to
  move to, and a placement that places itself owns its position — so `move_chat` answers
  `moved: false` with the reason and what would work instead, rather than reporting success on a
  panel that did not budge. `read_chat_surface` is there so the agent can ask before it acts
  instead of learning through a failure; it is read-only.

  None of them is stamped `x-destructive`. Moving a window destroys nothing, and a confirmation
  card in front of it would be worse than the move.

**Your drag surface must listen to drag events, and many "modern" ones do not.** `drag_and_drop`
dispatches the native HTML5 sequence with one shared `DataTransfer`. A surface built on a
pointer-event drag library — dnd-kit, most React DnD packages, the Angular CDK — listens to
`pointerdown`/`pointermove` and **never sees any of it**: the agent's drag is a silent no-op that
still reports success. Either use the native API or pick a library that listens to drag events.
React's synthetic `onDrop` does receive the dispatched sequence, `DataTransfer` included.

**A page action reports that it fired, not that it worked.** `drag_and_drop` returns as soon as the
sequence is dispatched; whether your drop handler's save succeeded is invisible to it, so a refused
change still looks like a successful tool call. Two things follow. Have the page report its own
refusals somewhere the agent can read them, and have the agent re-read the page before claiming
anything. Where the outcome matters more than the gesture, call the operation as a **server tool**
instead — it can return the real error.

**A page that saves asynchronously should say so.** A verification read straight after a drag can
outrun the page's own save and conclude that nothing happened. Report a busy flag in your
`getPageMap` (`{ saving: true }` while a write is in flight) and the agent can wait for a page that
says it is busy. It cannot wait for one that does not.

Targets resolve through the overridable `resolvePageTarget` property — `(target) => HTMLElement |
null`, defaulting to `document.querySelector`. A host with a page map overrides it to map its own
element ids (the same way the DOM-driver primitives are wrapped with environment-aware lookups):

```js
chat.resolvePageTarget = (id) => myPageMap.elementFor(id);
```

**Destructiveness.** Page actions are *not* stamped `x-destructive` — a drag rearranges transient
state, and the durable change happens at the page's explicit commit (a Save), which stays in the
user's hands. If your page persists *on drop* (a kanban board firing a PATCH from the drop
handler), gate `drag_and_drop` with [`confirmPredicate`](#inline-confirmation-x-destructive--x-confirm--confirmpredicate)
— or don't enable it. A target that resolves to nothing returns a clean, model-readable tool error.
