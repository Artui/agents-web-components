# Tool calls and sub-agents

## Tool-call display modes

How tool calls are drawn is set via the `data-tool-display` attribute (or `toolDisplay`
property), one of `grouped` / `inline` / `minimal` / `compact` / `full` (default `grouped`; an
absent or unknown value reads as `grouped`):

- `grouped` — the default. A run's consecutive tool calls fold into one quiet row, **"Worked
  through 5 steps"**, with a note such as **"1 failed"** beside it, and the calls one click down
  as `full` cards, or in the mode `data-tool-group-display` names. Anything else in the turn (text, a confirmation, a question) ends the group, and
  the next call starts a new one; a call's own rendered output does not. A group of one call shows that call's own label. See
  [The step group](#the-step-group).
- `inline` — the lightest mode: a single status row (icon + summary, no card chrome) with the
  result behind its own toggle. Reads as one line of the answer — pairs with [the answer
  well](theming.md#the-answer-well).
- `minimal` — tool name + status pill only.
- `compact` — name + status, with arguments *and* result behind a single collapsed toggle.
- `full` — arguments visible, result behind the toggle. The default before `grouped`: set
  `data-tool-display="full"` to keep per-call cards.

Whichever mode is on, a settled card's body holds **two labelled regions** — `Arguments` and
`Result` (or `Error` / `Declined`) — each with its own part and each pretty-printed. They are
never run together into one block, so where the call ends and the answer begins is always
visible. Style them via the `tool-card-args` / `tool-card-result` parts, their headings via
`tool-card-section-label`, and the whole body via `tool-card-body`.

**A card names its status as a part.** `::part()` takes no attribute selector, so a rule on
`tool-card-status` reaches every outcome alike. The card and its status pill each carry a modifier
beside the base part, one of `pending`, `deferred`, `done`, `error`, `declined` or `interrupted`,
and it is replaced whenever the status changes:

```css
ag-ui-chat::part(tool-card-error)        { border-color: crimson; }
ag-ui-chat::part(tool-card-status-error) { font-weight: 700; }
```

**The attribute is live.** Changing `data-tool-display` between the four card modes restyles every
card already in the transcript, the way `data-answer-well` does — the modes are pure visibility
over one DOM shape, selected by the shadow CSS from the host attribute. Grouping is decided as
each card is built: switching **to** `grouped` folds only the calls drawn afterwards, and
switching **away** from it flattens the groups already drawn, by CSS, into exactly the cards the
new mode builds (the group stops generating a box and its row is hidden).

### Choosing how a group draws its calls

Under `grouped`, an opened group draws its calls as `full` cards unless the
`data-tool-group-display` attribute (or `toolGroupDisplay` property) names another of the card
modes: `compact`, `minimal` or `inline`. Each draws the regions the flat card of that mode draws,
laid out as a row of the group's list rather than as a boxed card. An absent or unknown value
reads as `full`, so nothing changes for a host that does not set it.

```html
<ag-ui-chat endpoint="/agent/" data-tool-group-display="compact"></ag-ui-chat>
```

It is read only under `grouped`. Under one of the four card modes the groups are flattened into
that mode's cards and the inner value is ignored; switching back to `grouped` applies it again.
It is live like the outer attribute: changing it restyles groups already in the transcript.

A call waiting on an approval shows its arguments and its Approve and Deny buttons in every inner
mode, as it does in every card mode, and Approve takes focus when the group opens for it.

### The step group

Under `grouped` the row reads, by state:

| State (`data-state` on the `tool-group` part) | Label | Mark |
| --- | --- | --- |
| `running` | "Working through 3 steps", and the running step's label as a note | spinner |
| `waiting` | "3 steps", with "1 waiting for you" | accent dot |
| `done` | "Worked through 3 steps" | check |
| `error` | "Worked through 3 steps", with "1 failed" in the danger colour | error mark |

"N declined" is added as a note whenever a step was declined. `data-count` carries the number of
steps and `data-open` whether the cards are showing; the head is a button with `aria-expanded`.

- **It opens itself while a step waits on you.** A server-side approval renders inside the gated
  call's own card, so a folded group would hide the question it is asking: the group opens when a
  step goes `deferred`, once per wait, and stays folded if you fold it again. It opens before the
  approval is drawn, so the Approve button takes focus and scrolls into view. A client-side
  confirmation and an `ask_user` question render in the answer beside the group rather than inside
  a card, so they are in view without it opening; the row still reads `waiting` ("1 waiting for
  you") while one is open, as the card carries a `data-asking` flag for the group to read, and its
  `data-status` stays `pending`.
- **A one-step group is named after its call, and the card's head is not repeated inside.** A turn
  with exactly one call reads as that call's label ("Fill field"), and the opened list shows the
  card without its own `tool-card-head` (the row's state mark and notes carry the status). The
  Details toggle and arguments stay, except under `data-tool-group-display="minimal"`, where the
  card is only its head: there the row draws no chevron, though it still opens for an approval. A
  card display mode keeps the head. A run that grows to two calls brings both heads back.
- **A running sub-agent does not open it.** The row keeps its spinner and names the delegation
  instead, "Delegated to researcher" (the `subAgentDelegatedTo` string).
- **Repeated labels are told apart.** Two "Fill field" steps read "Fill field" and "Fill field
  (2)": the ordinal is an element of its own (part `tool-card-repeat`) beside the card's name, so
  `tool-card-name` is never rewritten, and a card mode hides the ordinal.
- **Rendered output stays in view.** A tool's `render` output is placed after the group, in call
  order, rather than inside it, so a chart is never one click down. It does not end the group: a
  later call joins the group above it, which is also how a restored conversation draws the run.

Parts: `tool-group` (with the state beside it as `tool-group-waiting`, `tool-group-running`,
`tool-group-done` or `tool-group-error`), `tool-group-head` (the button), `tool-group-icon`, `tool-group-label`,
`tool-group-meta` (holding one `.tool-group-note` per note), `tool-group-list` (the cards), and
`tool-card-repeat` on a repeated step. The focus ring is `--ag-ui-ring` and the disclosure chevron
`--ag-ui-ico-chevron`. Strings (`strings` / `data-strings`): `toolGroupSteps`,
`toolGroupWorking`, `toolGroupWorked` (each with `{count}`, always 2 or more), `toolGroupWaiting`,
`toolGroupFailed`, `toolGroupDeclined` (each with `{count}`) and `toolStepRepeat` (with `{n}`).

```html
<!-- Keep per-call cards, as before grouped was the default -->
<ag-ui-chat endpoint="/agent/" data-tool-display="full"></ag-ui-chat>
```

### Drawing a card's body yourself

A thirty-field result is a wall of JSON where a host wanted a table, or a
sentence. `formatToolPayload` is the seam: it is asked about each region of each
card and may return a `Node` to take it over, a `string` to replace its text, or
`null` to leave the built-in pretty-print alone.

```js
chat.formatToolPayload = (payload) => {
  if (payload.kind !== "result" || payload.toolName !== "list_orders") {
    return null; // everything else keeps the default rendering
  }
  const table = document.createElement("table");
  // ... build it from JSON.parse(payload.text)
  return table;
};
```

Both halves come through the same hook, told apart by `kind`: `arguments`
carries the parsed record the call was made with, `result` the raw string the
tool returned plus the outcome it settled on. A region a formatter took over is
marked `data-formatted`, which relaxes the preformatted whitespace the default
JSON block relies on — a table would otherwise inherit it as mangled cell
spacing. Whitespace only: the card's face, frame and scroll cap stay, so one long
payload still cannot stretch the transcript, and a host wanting different
typography restyles the `tool-card-result` part.

This is **presentation, not translation.** The card and the model already read
separate copies of a tool result — the model's is maintained by `@ag-ui/client`
from the same event — so a formatter changes what the person reads and nothing
the agent reads. That is what makes restyling safe here, and it is also why
*rewording* belongs on the server: renamed there, the new wording reaches the
model's prose too, instead of leaving the card disagreeing with the answer beside
it. A returned string is set as text, never parsed as markup — this is not a
second HTML channel into the transcript.

A gated call carries the decision (`approved by you` / `declined by you`, part
`tool-card-decision`, attribute `data-decision`) — from the client-side confirmation card and
from the server-side approval interrupt alike. The prompt itself disappears once answered: a
prompt and a record are different objects, and the record is the card.

**The annotation is session-scoped**, like the "run interrupted" notice. AG-UI carries no
approval message — the answer rides `resume[]` as transient run input — so a reload restores the
tool call and its result but not the note that a human waved it through. If you need "who
approved what" durably, that is an audit concern rather than a transcript one; record it
server-side.

A call no person was asked about can still have been approved: by a reviewer model, or by a
routine's standing grant. No interrupt is raised for it, so the tool call card carries the mark.
When a result's `metadata.answered_by` (django-ag-ui 0.81.0 or later stamps it, live and on the
stored tool message) starts `reviewer:` or `routine:`, the card gets
`data-answered-by="reviewer"` or `"routine"` and a note in its head (part
`tool-card-answered-by`, strings `answeredByReviewer` / `answeredByRoutine`). Any other value,
and a result without the key, render exactly as before. Unlike the decision, the mark survives a
reload, because it is read off the stored message. It is display only: the server's audit record
is the authority.

If a tool's schema carries an `x-summary` string (use `X_SUMMARY_KEY`), the card shows it on the
label instead of the raw tool name.

Every card leads with a **status icon** drawn entirely in CSS — a spinning ring while the call
runs, then a check / cross / slash / dotted ring on success / error / decline / not finished.
Re-theme it via custom properties (or the `tool-card-icon` part): `--ag-ui-tool-icon-done`,
`--ag-ui-tool-icon-error`, `--ag-ui-tool-icon-declined`, `--ag-ui-tool-icon-interrupted`
(quoted-string glyphs) and `--ag-ui-tool-spin-duration` (spinner
speed; the spin respects `prefers-reduced-motion`).

```html
<ag-ui-chat endpoint="/agent/" data-tool-display="compact"></ag-ui-chat>
```

## Delegated sub-agents

A run that hands work to a sub-agent reads as a stall. The parent's
`delegate_task` card sits at "running…" for the child's entire duration —
however many tools the child calls, however long it takes — with nothing on
screen to say anything is happening.

If your server narrates that, the component draws it. The wire is an ordinary
AG-UI `CUSTOM` event named `ag_ui.subagent`, carrying:

| Key | Meaning |
| --- | --- |
| `delegationId` | the **parent's own `delegate_task` tool-call id** — not the child's run id |
| `agent` | the child agent's name |
| `phase` | one of `started`, `tool_call`, `tool_result`, `finished`, `failed`, or a [task phase](#task-control) |
| `status` | a pre-rendered line, ready to show |
| `tool` | `toolCallId`, `name` and `ok`, on the two tool phases only |
| `task` | the task a [task phase](#task-control) names, on those phases only |

Exactly one `started` opens a delegation and exactly one `finished` or `failed`
closes it. `ok` is a tri-state: `null` while the child's call runs, `true` on a
result it accepted, `false` on one that came back to it.

Because the key is the *parent's* call id, the surface attaches to a card that
already exists rather than floating a second element with the same identity: one
**collapsed row per delegation**, live, carrying the server's `status` line and
nothing else, expanding onto the child's own tool calls. A ten-step child costs
one row until somebody opens it, and there is no second visual language — it
reads the way tool cards already read.

`status` is why the collapsed row needs no wording of its own. The structured
keys are there for a host that would rather write its own.

The row shows in **every** [display mode](#tool-call-display-modes), including
`minimal`. It sits outside the card body rather than in it, because the body is
what the density modes hide — and a live progress line that only appeared in
`full` would leave exactly the stall it exists to end. Same reasoning that shows
a deferred card's arguments whatever the mode.

**A failure carries no exception text on this channel, deliberately** — the same
reasoning that redacts a `RUN_ERROR`, since an exception's words are written for
an operator. The detail rides the ordinary tool result for that delegation, which
lands in the same card's `Result` region a few pixels below. Nothing here invents
words the server declined to send.

**None of it is persisted.** A `CUSTOM` event never enters the message list, so
nothing replays on a thread restore — which is the right half of the
[carrier split](server-pushed-ui.md#which-carrier-should-the-server-use): a delegation that was live
an hour ago is not live now, and replaying its progress would be a lie about a
run that is over. Reload mid-run and the tool card is still there; the nested
detail is not. That is the intended behaviour.

**A child's tool calls on the protocol's own events stay the child's.** A server may also send
them as `TOOL_CALL_*` events tagged with the delegation's `subagentRunId`, as django-ag-ui does
from 0.90.0. The component draws no card of the parent's for a tagged call and never runs it,
even when a frontend tool has the same name; the row above still follows the `CUSTOM` steps.
`@ag-ui/client` keeps those calls in the message list under the same tag. A restored thread
skips them, and a child's call left without a result is never answered for the parent.

Like `ag_ui.invalidate`, this name is **routed** rather than forwarded: it draws
itself and does not also arrive as an `ag-ui-custom` event. Every other name
still reaches your page untouched.

Style it through `tool-card-subagent` (the region inside the card), `subagent`,
`subagent-row`, `subagent-icon`, `subagent-status`, `subagent-steps`,
`subagent-step`, `subagent-step-icon` and `subagent-step-name`. The two glyph
states reuse the card's own `--ag-ui-tool-icon-done` / `--ag-ui-tool-icon-error`
properties and its spinner speed, so re-theming the cards re-themes these. The
row's own chrome comes from `subAgentWorking` and `subAgentSteps` in
[`UiStrings`](i18n.md#internationalization-i18n); everything else on the row is the
server's text.

### Task control

Under django-ag-ui's task control (0.90.0+, `SubAgents(task_control=TaskControl())`) a
delegation is a task the parent's model manages, and the row draws what happens to it. The
task's moments arrive on the same `ag_ui.subagent` event with `tool: null`, a server `status`
line and a `task` record:

| `phase` | When | `task` carries |
| --- | --- | --- |
| `backgrounded` | the task moved to the background | `taskId`, `reason` (`requested`, `auto`, `question`) |
| `steered` | the task was sent a message | `taskId`, `message`, `source` |
| `question` | the task asked the parent a question | `taskId`, `questionId`, `question` |
| `answered` | the question was answered | `taskId`, `questionId`, `answer`, `source` |
| `cancel_requested` | the task was asked to stop | `taskId`, `forced`, `source` |
| `retried` | a remote task's worker is running it again | `taskId`, `attempt` |

From django-ag-ui 0.91.0 the steps carry what was said, cut at 8000 characters with
`truncated` beside it, and `source` says who acted: `user` for the controls below, `model` for
the run itself. The row shows the open question's text and otherwise the server's `status`
line ("researcher: steered by you"). The panel's `data-phase` is the latest moment. What
outlasts a moment is stamped on the `subagent` part for a host to style:

| Attribute | Set |
| --- | --- |
| `data-task-id` | the task the steps name |
| `data-background` | once the task left the foreground; the value is the server's `reason` |
| `data-awaiting-answer` | from `question` until `answered`, or until the task settles |
| `data-cancel` | `requested` or `forced`, once a cancellation was asked for |
| `data-attempt` | a remote task's retry count, on `retried` |
| `data-source` | `user` or `model`: who acted on the latest steer, answer or cancel |

A task closes on the protocol's events as before, and two `SUBAGENT_ERROR` codes are not the
child failing: `code: "cancelled"` settles the row as `data-phase="cancelled"` ("researcher was
cancelled", `subAgentCancelled`), and `code: "unfinished"`, sent when the run ends while a
background task is still open, as `data-phase="unfinished"` (`subAgentUnfinished`). Any other
code, or none, is `failed`, on the server's words. A resumed task opens a new delegation, with a
fresh `subagentRunId`, on the `delegate_task` call that resumed it, so it draws on that call's
card. None of it is stored, as above: a restored thread shows the cards and no task progress.

The glyph follows: a cancelled task draws the card's `--ag-ui-tool-icon-declined` and an
unfinished one its `--ag-ui-tool-icon-interrupted`, both muted, and an open question stops the
spinner for a still ring in the accent colour.

#### Steer, answer and cancel

With `data-threads-url` set, a live task's row offers three controls beside it, in the
`subagent-controls` part:

- **Steer** opens a field (`subagent-reply`) whose text is sent to the task.
- **Answer** appears while the task waits on a question, beside the question's text
  (`subagent-question`), and sends the answer to that question.
- **Cancel** asks the task to stop before its next model request. Once that request is on the
  stream (`data-cancel="requested"`) the button reads **Stop now** and stops the task at once.

Each control is one `POST` to the route django-ag-ui (0.91.0, with a `run_store`) serves beside
the thread, with the element's headers and cookie policy:

| Control | Route | Body |
| --- | --- | --- |
| Steer | `<threads-url><thread>/tasks/<taskId>/steer/` | `{"message"}` |
| Answer | `<threads-url><thread>/tasks/<taskId>/answer/` | `{"question_id", "answer"}` |
| Cancel | `<threads-url><thread>/tasks/<taskId>/cancel/` | `{"force"}` |

The server acknowledges with `202`, and the row does not change until the step for the act
arrives on the stream: a control never sets a state itself. A request is sent once and never
retried, a `401` included, since a steer sent twice is two messages. A refusal is worded from
its `reason` code under the controls (`subagent-control-error`): `not_running`, `no_task` and
`no_run` as `subAgentControlFinished`, `not_waiting` as `subAgentControlNotWaiting`,
`not_live_here`, `remote` and a server without the routes as `subAgentControlUnavailable`, and
anything else as `subAgentControlFailed`. The controls are withdrawn when the task settles.

The parts are `subagent-controls` (the region), `subagent-question`, `subagent-actions` (the
three buttons' row), `subagent-steer`, `subagent-answer`, `subagent-cancel`, `subagent-reply`,
`subagent-reply-input`, `subagent-reply-send` and `subagent-control-error`. Their text comes
from `subAgentControls` (the group's label), `subAgentSteer`,
`subAgentAnswer`, `subAgentCancelTask`, `subAgentForceCancel`, `subAgentSend`,
`subAgentSteerPlaceholder` and `subAgentAnswerPlaceholder`. The routes reach only a run live
in the process serving the request and only top-level tasks; anything else is refused and
worded as above.

### Child sessions

A child session (django-spec-agents' `start_session`) runs headless in a thread
of its own and sends nothing into the parent's stream. What persists is its
receipt, the call's tool result (`{ agent_id, thread_id, run_id, note }`), so the
link is read from that, on the live result and on a restore alike: **the card
that started a child links to the child's thread, and still does after a
reload.** A refusal, or any other result, draws no link.

- **A child that needs you.** When the thread list the chat holds (the drawer's
  listing, or `data-thread-status`'s watch) shows the child's row `waiting`, the
  link reads `childSessionNeedsYou` ("The researcher task needs you") instead of
  `childSessionOpen`, and carries `data-status`. It still only opens the child:
  the parent never draws the child's approval or any control that answers it.
- **The breadcrumb.** When the thread on screen is a child (django-ag-ui 0.86.0
  lists `parent` on its row, read onto `ThreadMeta.parent`), a line between the
  header and the transcript reads `parentThread` ("From {title}"), or
  `parentThreadUnlisted` when the list does not hold the parent, and opens it.
- **The drawer** nests each child under its parent's row (`drawer-row-child`,
  inside a `drawer-children` group), in the parent's date group whatever the
  child's own date. A child whose parent is not listed, or that a filter matched
  without its parent, stands at the top level.

**Opening a thread asks first.** A link or the breadcrumb dispatches
**`ag-ui-open-thread`** (`OPEN_THREAD_EVENT`, detail `{ agentId, threadId }`,
typed `OpenThreadDetail`), bubbling, composed and cancelable. `agentId` is the
receipt's `agent_id`, or the parent's store `scope` (`null` when unscoped). The
chat cannot tell which agent it serves, so unless a listener calls
`preventDefault()` it then opens the thread in place, as a drawer pick does,
letting go of a run in flight. A host whose child runs on another agent's mount
takes the event, opens that thread where it lives, and prevents the default (under an
[`<ag-ui-agents>` provider](agents.md#several-agents-under-one-provider) that is done for a listed agent):

```js
chat.addEventListener("ag-ui-open-thread", (event) => {
  if (event.detail.agentId !== null && event.detail.agentId !== "assistant") {
    event.preventDefault();
    openAgentThread(event.detail.agentId, event.detail.threadId);
  }
});
```

Nothing to opt into. The breadcrumb and the needs-you wording wait for a list:
after a reload straight onto a child under a remote store, that is the first
drawer open, switch or `data-thread-status` tick.

## Editing a gated call before approving it

AG-UI's resume payload carries `editedArgs`, and the protocol gates it on the
agent's own `approveWithEdits` capability. The approval card can offer it:

```js
chat.approveWithEdits = true; // your server accepts editedArgs
```

**Off by default, and an assertion about your server rather than a
negotiation** — capabilities are not on the wire this component reads, so it
cannot check. Turned on against a server that ignores `editedArgs`, a user would
edit arguments it silently discards, which is worse than not offering.

The card then shows the call's arguments as editable JSON. `editedArgs` rides
the resume payload **only when something actually changed**, so a server can tell
"approved as proposed" from "approved, but like this" without diffing what it
already sent. Unparseable JSON, or JSON that is not an object, keeps the card
open with the reason on it rather than approving the original behind the user's
back.

Only offered for an interrupt naming a tool call this component holds a card
for — the card is where the arguments still are.
