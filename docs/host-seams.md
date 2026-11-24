# Host seams: the SPA story

`<ag-ui-chat>` is a generic embedding kit; these typed seams let a host feed the agent richer
context up front so it explores less. All are framework-free and admin-agnostic.

**`routeMap: RouteMap`** — a manifest of navigable routes (`{ id, path, title?, group?,
description? }`). When set, the element exposes two built-in tools so the agent navigates by intent
rather than by exploring:

- `list_routes` — read-only; lists the routes.
- `navigate_to_route(route_id, params?)` — resolves the id to a path and navigates.

A route `path` may contain `:param` segments — e.g. `/projects/:id/users/:userId/`.
`navigate_to_route` substitutes the path params (URL-encoded) and sends any leftover params as a
query string; a missing or empty required path param throws. The resolved shape is the exported
`RouteWithParams` type.

```js
chat.routeMap = [
  { id: "users", path: "/users", title: "Users", description: "Manage user accounts" },
  { id: "billing", path: "/billing", title: "Billing" },
  { id: "user-detail", path: "/projects/:id/users/:userId/", title: "User detail" },
];
```

**`getPageMap(): PageMap`** — a per-run provider returning the current page's compact actionable
surface (field names/types/labels, button labels+handles — *not* values). It is auto-injected into
each run's `context` as a `page_map` entry (toggle with `autoInjectPageMap`):

```js
import { pageMapFrom } from "@artooi/agents-web-components";

chat.getPageMap = () => pageMapFrom();
```

`pageMapFrom` is the walker the package ships ([below](#reading-the-page-pagemapfrom)); a host
with its own model of the page returns that instead, in any shape.

It is recomputed at the top of **every tool round**, not once per `send()` — so after the agent
acts, the next round already sees the resulting page. Within a round the agent can pull a fresh
view at any time with the built-in `read_page` tool, which is registered whenever this provider is
set.

**Check that your server reads `context` at all — pydantic-ai's AG-UI adapter does not.** The
auto-injected `page_map` rides in `RunAgentInput.context`, and an adapter that ignores that field
drops it silently: nothing errors, and the model simply never sees the page. On such a backend
`read_page` is the channel that works, and it is the one to rely on. Nothing to configure — just do
not assume the injected copy arrived, and if the page map matters to your prompt, put it there
server-side or let the agent call `read_page`.

That leaves one window: the page can move *after* a round's context was built but *before* the
agent's tool call arrives — the user clicks a link, or presses back. Calls landing in that window
are **refused** with a result telling the agent to call `read_page` and retry. Most would have
missed anyway; the guard exists for the case where a same-named control on the new page matches and
the agent would otherwise act on the wrong page without either side noticing. `read_page` and tools
marked `x-navigates` are exempt. The guard runs in any round that offered `read_page`, including
one you registered yourself, and is inert in a round that did not (no `getPageMap`, or a
[place the user withheld](#where-the-user-is-the-place-chip)), since its result would name a tool
the agent does not have.

**`registerPageState({ name, read, write?, schema? })`** — ergonomic sugar over `registerTool` for
SPA app state (Redux/Zustand/signals). It auto-generates a `read_<name>` (read-only) tool and, when
`write` is supplied, a `set_<name>` tool stamped `x-destructive`:

```js
chat.registerPageState({
  name: "cart",
  read: () => store.getState().cart,
  write: ({ items }) => store.dispatch(setCart(items)),
  schema: { type: "object", properties: { items: { type: "array" } } },
});
```

**This is not AG-UI shared state** — that is `sharedState`, below. `registerPageState` generates two
ordinary client tools; the agent reads or writes your store by *calling a tool*.

**`sharedState`** *(property)* — AG-UI **shared state**: the protocol's own state channel, sent as
`RunAgentInput.state` on every run and replaced in place when the server streams `STATE_SNAPSHOT` /
`STATE_DELTA`. Assign to seed it, listen for `ag-ui-state` to react:

```js
chat.sharedState = { document: "" };

chat.addEventListener("ag-ui-state", (e) => {
  editor.value = e.detail.state.document;   // the agent rewrote it
});
```

Server-side, a tool mutates `ctx.deps.state` and returns the snapshot as `ToolReturn` metadata —
pydantic-ai does not emit deltas for you:

```python
@tool(registry)
async def write_document(ctx: RunContext[AgentDeps], body: str) -> ToolReturn:
    """Replace the shared document."""
    ctx.deps.state = {**(ctx.deps.state or {}), "document": body}
    return ToolReturn(
        return_value="written",
        metadata=[StateSnapshotEvent(type=EventType.STATE_SNAPSHOT, snapshot=ctx.deps.state)],
    )
```

Use this when the agent and the page are editing **the same object** (a document, a form, a
canvas). Because it is the page's object rather than the conversation's, **New chat keeps it**; a
change of [`user-key`](durability.md#who-the-stored-conversation-belongs-to-user-key) clears it. Use
`registerPageState` when the agent should *ask* for a value or *request* a change —
the tool call is visible in the transcript and can be gated by a confirmation card, which state
events cannot.

**`navigate(path): void`** *(optional)* — a host routing callback. **This single seam is what
distinguishes an SPA from an MPA.** When set, `navigate_to_route` routes client-side (no reload) and
the in-memory run loop simply continues — the whole resumable-loop / checkpoint machinery is
bypassed. When unset, navigation falls back to `window.location` and the MPA reload model above
applies.

```js
chat.navigate = (path) => router.push(path); // SPA: in-page, no reload
// leave unset for an MPA: window.location + checkpoint/resume
```

Route map + `navigate()` and the reload model are the same feature seen from two ends.

**`ag-ui-run-finished`** *(event)* — an interaction has ended, and here is what ran in it.
`detail: { threadId, tools: readonly ToolRun[], invalidated, outcome }` (typed `RunFinishedDetail`),
where each `ToolRun` is `{ name, side: "server" | "client" }` in settle order. `threadId` is the
thread the run belonged to, which is not always the one on screen: a run that a new chat or a
thread switch stopped still reports once its request closes. `outcome` is how the interaction
ended: `"completed"`, `"stopped"` (Stop, a new chat or a thread switch cut it off, or the server
cancelled it; see [A run the server stops](concepts.md#a-run-the-server-stops)) or `"failed"`
(the agent reported an error). Ignore an `outcome` you do not know: more may be added.

**This is the seam for a host that renders data the agent can change.** A server-side tool writes
without your page's knowledge: nothing else the element dispatches implies "something may have moved
underneath you", so a page that fetched its data on mount has no reason to refetch and quietly goes
stale. Approve a server-side booking on a calendar and the row exists while the calendar keeps
showing the week it loaded.

```js
chat.addEventListener("ag-ui-run-finished", (e) => {
  // A "client" tool ran in your own handler, so you already know what it did.
  if (e.detail.tools.some((tool) => tool.side === "server")) {
    void refetchBoard();
  }
});
```

It fires **once per interaction**, not once per tool round, and it fires on completion, error and
cancellation alike — a partial write is still a write. A capability load (an agent skill activating)
is not counted: it moves nothing a host renders.

A run a switch stopped reports `outcome: "stopped"` whichever thread is on screen when it does,
so a listener that marks attention or counts completions tells a cancelled run's late event from a
finished one by `outcome`, not by `threadId`.

**Deferring a switch until the run is over** keys on `running` and `data-running`, never on this
event: it fires for a stopped run too, late, and a stale one can arrive while the next run is live.
`data-running` toggles only for the live run, and there is no running-change event, so watch the
attribute:

```js
let queued = null;
const release = () => {
  if (!chat.running && queued !== null) {
    const id = queued;
    queued = null;
    void chat.switchThread(id);
  }
};
new MutationObserver(release).observe(chat, { attributes: true, attributeFilter: ["data-running"] });
myBar.onPick = (id) => {
  if (chat.running) {
    queued = id;
  } else {
    void chat.switchThread(id);
  }
};
```

`sharedState` above is the richer channel and this is not a replacement for it — but it is not a
substitute the other way round either, because shared state requires the *agent* to emit
`STATE_SNAPSHOT`, which is not the host's decision to make. Use state when the two ends edit one
object; use this when your page owns the data and just needs to know it moved.

**`ag-ui-custom`** *(event)* — the agent sent an AG-UI `CUSTOM` event.
`detail: { name, value }` (typed `CustomAgentDetail`), both verbatim and uninterpreted.

```js
chat.addEventListener("ag-ui-custom", (e) => {
  if (e.detail.name === "invalidate") {
    void refetch(e.detail.value);
  }
  // Any other name: no listener, nothing happens. That is the intended outcome.
});
```

`CUSTOM` is one of exactly two AG-UI carriers whose payload name is an open
string the protocol does not enumerate, and it is the **imperative** one:
something for your page to *do*. Its sibling `ACTIVITY_SNAPSHOT` carries
transcript **content**, which is why an activity is materialised into a message,
persisted with the thread and replayed on restore, and this is not.

**That asymmetry is the rule for choosing between them.** Content has a place in
the conversation and should replay. An imperative has no place and no meaning
once acted on — replaying "refetch the board" on every thread load is a bug, not
a feature. If it must survive a reload, it belongs on the other carrier.

The element takes no view of what a name means and forwards every one, so a name
it has never heard of reaches you unchanged. A host with no listener for a name
simply ignores it, which is the graceful outcome an open field exists for.

**`ag-ui-invalidate`** *(event)* — the agent named resources its write moved.
`detail: { keys, reason }` (typed `InvalidateDetail`).

One `CUSTOM` name routed to its own event so you do not have to string-match;
every other name still arrives as `ag-ui-custom`. It fires **as each
announcement arrives**, during the run, and the same keys ride
`ag-ui-run-finished` again at the end as `invalidated`, de-duplicated.

> **Do not reload the page on this.** The user was probably typing. An
> agent-triggered reload or a blind refetch into a live form destroys unsaved
> input, and from their side the page threw their work away on its own. Check
> first, and offer rather than act:

```js
chat.addEventListener("ag-ui-invalidate", (e) => {
  if (formIsDirty()) {
    showBanner("This data changed. Refresh when you're ready.", e.detail.keys);
    return;
  }
  refetch(e.detail.keys);   // e.detail.keys → ["orders", "orders/42"]
});
```

**Keys are opaque and matching is exact.** `orders/42` does not imply `orders` —
a prefix rule would be the component guessing at a scheme it does not own, and
`orders/1` would match `orders/11`. A server that wants the collection refreshed
names it. Your own matching may be hierarchical, because in your vocabulary the
scheme is known; that is what TanStack query keys are built for.

Already listening on `ag-ui-run-finished`? Upgrading is one line, and the `else`
is the whole compatibility story:

```js
if (detail.invalidated.length > 0) refetchOnly(detail.invalidated);
else if (detail.tools.some((t) => t.side === "server")) refetchEverything();
```

| Server | Client | Result |
| --- | --- | --- |
| old | old | coarse refetch, as today |
| new | old | the `CUSTOM` event is ignored; coarse refetch still fires |
| old | new | `invalidated` is empty; the `else` branch runs |
| new | new | precise, and live during the run |

Nothing negotiates and nothing handshakes, which is what makes this shippable
across repos with independent release cadences.

**Note:** it reaches **the page that started the run**, during the run. There is one
response stream per run and no channel to anybody else's browser.

## Reading the page: `pageMapFrom`

**`pageMapFrom(root?, options?): PageMap`** reads the live DOM under `root` (the document by
default) and returns what a model needs to act on it, never what the user typed. It is opt-in:
nothing changes for a host that leaves `getPageMap` unset, or sets its own.

```js
chat.getPageMap = () => pageMapFrom();
chat.getPageMap = () => pageMapFrom(document.querySelector("main"), { limits: { links: 10 } });
```

Each kind is a key holding a list, left out when empty:

| Key | Lists | Each entry has | Cap |
| --- | --- | --- | --- |
| `headings` | `h1`-`h6`, `role="heading"` | `level`, `text` | 30 |
| `landmarks` | `main`, `nav`, `aside`, `search`, a top-level `header` / `footer`, a named `form` / `section`, landmark roles | `role`, `name` | 20 |
| `tabs` | `role="tab"` | `name`, `selected` | 30 |
| `fields` | inputs, `textarea`, `select`, field roles (`textbox`, `combobox`, `checkbox`, `slider`, ...), `contenteditable` | `name` (the attribute), `type`, `label`, `required`, `disabled` | 50 |
| `buttons` | `button`, button inputs, `role="button"` | `name`, `disabled` | 50 |
| `links` | `a[href]`, `role="link"` | `name`, `href` | 50 |
| `tables` | `table`, `role="table"` / `"grid"` | `name`, `headers` (column headers, at most 20) | 10 |
| `dialogs` | an open `dialog`, `role="dialog"` / `"alertdialog"` | `name`, `modal` | 5 |

Past a cap, `truncated` counts what was left out per kind (`{ "links": 12 }`); `options.limits`
replaces any cap, and `PAGE_MAP_LIMITS` holds the defaults. Names and texts are cut at 80
characters. `required`, `disabled` appear only when true.

**What it never reads.** A value rides into the model's context, so the walker reads what the page
*says about* a control, never what is *in* it:

- no field's value, and no password or hidden input at all;
- no `aria-valuenow` / `aria-valuetext` (a slider lists its label and role, not its position);
- no text of a `contenteditable` region, nor of a `textarea`, `select`, `input` or `output` inside
  a label, button or heading, so a label wrapping its control never echoes the control;
- no option text, so neither the selected option nor the choices are listed;
- no link's query string or fragment (`href` is the path, with the origin when it is another site);
- a `placeholder` only as the label of last resort, after `aria-labelledby`, `aria-label`, the
  field's `<label>`s and `title`, since it is author text.

Text the page itself writes is read as it is: a heading or label that prints user data ("Signed in
as ...") reaches the model like any other text. Mark such a region `data-agent-ignore`.

**What it skips.** The subtree of every element of this package (`ag-ui-*`, so the chat never lists
itself), of anything marked `data-agent-ignore`, and of anything hidden (`hidden`, `display: none`,
`visibility: hidden`), `inert` or `aria-hidden="true"`. It walks open shadow roots of your
components; a closed one is unreachable by design.

**Handles.** Each listed element is stamped `data-agent-handle="n"`, and its entry carries the
selector for it, `[data-agent-handle="n"]`, which the default `resolvePageTarget` resolves, so
`scroll_to` and `drag_and_drop` act on it with no host code. A handle survives later reads, and is
given to a new element when a clone carries the same stamp.

The default resolver is `resolvePageMapHandle`: `document.querySelector` first, and only when that
misses and the target is exactly a handle of this form, a search of the open shadow roots under the
document (skipping this package's own elements), so a handle the walker stamped inside a component
resolves too. Any other selector resolves in the light DOM alone, as before. A host that overrides
`resolvePageTarget` and still wants handles to resolve falls back to it:

```js
import { resolvePageMapHandle } from "@artooi/agents-web-components";

chat.resolvePageTarget = (target) => myPageMap.elementFor(target) ?? resolvePageMapHandle(target);
```

## Where the user is: the place chip

The composer can say where in your app the user is writing from: a chip in its tool row, between the
attach and voice controls and Send, naming the page, tab or record on screen. The same read is sent
to the agent as one context entry, so the place the user sees is the place the agent is told.

**`getPlace: () => Place | null`** returns a `Place`: `{ label, detail?, icon?, href? }`. The chip
draws the label, the detail after a dot, and the icon (an image URL; a pin when absent). The agent
gets a `place` context entry whose value is the JSON of the label, detail and href; the icon is
never sent. The href identifies the place; without one, the label and detail do.

```js
chat.getPlace = () => ({
  label: `Order #${order.number}`,
  detail: "Orders",
  href: location.pathname,
});
```

- **With no `getPlace`, a route map stands in.** The `routeMap` route whose path matches
  `location.pathname` names the place: its `title` (else its `id`) as the label, its `group` as the
  detail, and the path as the href. A host with a route map gets the chip without writing anything.
  With neither, no chip is drawn and nothing is sent; set `getPlace = () => null` to opt a
  route-mapped host out.
- **When it is read.** Before every tool round, so an agent that navigates mid-run is told the new
  page on its next round; and on connect, on expand, when the composer gains focus, on `popstate`
  and `hashchange`, and when the conversation on screen changes (`switchThread`, the drawer,
  `newChat`): the chip always names the live page, never the page a thread started on. Between runs
  it shows the last read. A single-page app calls **`refreshPlace()`** after its router moves,
  since `pushState` fires no event.
- **The entry rides after your `getContext`.** It is appended to whatever `getContext` returns, so a
  host that replaces `getContext` still sends it.
- **The eye toggle withholds it.** Pressing it leaves the chip in place, dashed and struck through
  (`data-excluded` on the `place` part), and the next round sends no `place` entry. It withholds the
  page too: that round also drops the `page_map` entry, whatever `getContext` returned, and does not
  offer `read_page`. Tools you register yourself, such as `registerPageState`'s, stay as you
  registered them. The choice holds while the same place is read, lapses when a different place is
  read, is not persisted, and cannot be lifted by the host.
- **Placement.** The same position in every placement, on a phone and in the greeting layout; the
  label truncates with an ellipsis before it can push Send off the row, and the chip's title
  carries it in full. Nothing shows while the panel is collapsed. The chip is separate from the
  `above-composer` slot, and filling the slot never hides it.
- **Styling and words.** Parts `place`, `place-icon`, `place-label`, `place-detail` and
  `place-toggle`; the colours come from the existing tokens. The tooltip and the toggle's labels are
  the `placeShared` and `placeWithheld` (token `{label}`), `placeStopSharing` and `placeShareAgain`
  strings.
