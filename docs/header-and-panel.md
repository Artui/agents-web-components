# Header, collapse and resizing

## New chat and collapse

The header carries built-in buttons for a new chat (a pencil on a square), maximize (two arrows pointing out) and
collapse (a chevron down, or on a sidebar a panel closing into its edge; `data-collapse-icon`
chooses it). The
matching JS API:

- `newChat()` — clears the transcript, drops the in-memory run state, and mints a new thread id.
  The conversation it leaves is **kept**: it stays in the history drawer to return to, and on a
  server-backed store it stays on the server. Deleting one is the drawer row's own action. A chat
  nothing was ever sent in is the exception — it was never listed, so it is dropped rather than
  left behind. Focus moves to the composer, whichever control started the new chat, unless the
  widget is collapsed, and the page is not scrolled to it. A restore still loading or replaying
  the conversation being left stops there, so nothing of it is drawn into the new chat, and a
  run it was about to resume after a reload is not resumed: coming back to that conversation
  later answers the interrupted call as not finished. Called before the element connects (or while
  it is out of the document), it waits: `threadId` stays `null` and nothing fires until the
  element connects, which then starts the new chat, so the one `ag-ui-thread` event is a `new`.
- `describeSurface()` — where the panel is and what can be done to it: placement, collapsed,
  `maximized` (read-only), what it collapses to (`collapseTo`), whether it can be moved, whether it fills the screen, its box and the viewport. `movable` folds
  the two reasons a move can fail into the one answer a caller needs.
- `moveTo(corner)` — send the panel to `top-left` / `top-right` / `bottom-left` / `bottom-right`,
  returning whether it went. It takes the axes the same way a user drag does, so the launcher
  travels with it and switching placement hands them back. Returns `false` rather than pretending
  when the placement owns its position or the panel fills the screen. Under `collapse-to="bar"`
  or `"none"` it moves the panel within the room above the bar or the anchor.
- `resetSize()` — drop the size the user dragged in the current placement, and its stored copy,
  so the placement's own size and your `--ag-ui-width` / `--ag-ui-height` apply again; sizes
  dragged in other placements are kept. For a host that enters a sized state of its own (an
  expanded mode) instead of the built-in [maximize](#maximizing-the-panel): a user's drag
  outranks host tokens, so call this first.
  Under `collapse-to="bar"` or `"none"` it also returns a panel the user dragged off its dock to
  the dock and forgets the stored spot; a corner panel under `auto` keeps its dragged position.
- `setCollapsed(collapsed)` / `toggleCollapsed()` — collapse or expand the widget. The state is
  reflected as the boolean `collapsed` attribute/property and persisted per-tab in
  `sessionStorage`, so it survives a reload.

Each change emits an `ag-ui-toggle` event (the `TOGGLE_EVENT` constant) with
`detail: { collapsed: boolean }` (typed `ToggleDetail`), so a host can mirror the state in its own
chrome — or hide the built-in toggle and drive the `collapsed` attribute itself.

```js
chat.newChat();
chat.toggleCollapsed();
chat.addEventListener("ag-ui-toggle", (e) => console.log(e.detail.collapsed));
```

### The header row and its More menu

The header shows every control it has while they fit. When they stop fitting, or when the row
would hold more than five, the optional controls move into a More menu (the three dots), one at
a time in this order: the theme toggle, Skills, checkpoints, then History. New chat, Maximize
and Collapse always stay in the row. Once anything has moved, the row holds at most four
controls beside More, so a header with every opt-in on still fits a 240px panel with its title
readable. With `data-routines-url` set, More also holds Make this a routine (the last item, in
the menu only) while the conversation on screen has a prompt, and it counts toward that cap, so
the first prompt may move a control into the menu.

Nothing to opt into, and nothing a host drives changes: a control in the menu is the same
`<button>`, with the same class (`header-btn--history`), `part` and `icon-*` slot, so
`::part(history-button)` still styles it and `shadowRoot.querySelector(".header-btn--history").click()`
still opens the drawer. In the menu it is a `menuitem` row showing its glyph and its name.
The menu takes `::part(header-menu)` and the button `::part(more-button)`; its name is the
`moreControls` string. From the keyboard, Enter, Space or the down arrow on More opens the menu
on its first row (the up arrow on its last); the arrows, Home and End move between rows, Escape
closes it and returns focus to More, and Tab or a click elsewhere closes it.

### Maximizing the panel

The maximize control (two arrows pointing out, `maximize-button` part, `icon-maximize` slot) grows the open panel,
and pressed again it restores it (the arrows point in). It is labelled "Maximize" and "Restore" (the `maximize`
and `restore` strings), apart from the launcher's and the rail's "Expand", which opens the panel.

- **Where it is offered.** A corner panel (`floating`, `bottom-left`, the default) and a docked
  one (`collapse-to="bar"` or `"none"`) grow on both axes; `sidebar` and `side` grow in width
  only. `page`, `full` and `embedded` have no control, and neither does any viewport of 600px or
  less, `data-small-viewport="off"` included. The control is absent from the header there, not
  hidden, and the state is refused: a panel maximized when its placement switches to one of
  these, or when the window narrows to 600px, leaves it.
- **What it grows to.** `--ag-ui-maximized-width` and `--ag-ui-maximized-height`, which default
  to the panel's cap (`--ag-ui-max-width` / `--ag-ui-max-height`, the room the host left less
  one gutter). A side column reads the width only.
- **The drag.** Entering it takes the dragged size off without forgetting it, and the resize
  grips are hidden while it lasts. Restoring, and collapsing (which leaves the state), put the
  placement's own size back, or the size the user dragged in it.
- **The API.** `chat.maximized` (reflected as the `maximized` attribute), `setMaximized(bool)`
  and `toggleMaximized()`. Each change emits `ag-ui-maximize` (the `MAXIMIZE_EVENT` constant)
  with `detail: { maximized }` (typed `MaximizeDetail`). It fires only while connected: a
  markup `maximized` is announced once at connect, and only if it holds (a panel that mounts
  collapsed announces nothing), and a change made while detached is announced once on reconnect,
  only if it differs from what listeners last heard. It is not stored: a reload opens at the
  placement's own size. `describeSurface()` reports it, and no agent tool changes it.

```js
chat.addEventListener("ag-ui-maximize", (e) => console.log(e.detail.maximized));
```

```css
ag-ui-chat { --ag-ui-maximized-width: 960px; --ag-ui-maximized-height: 85vh; }
```

`--ag-ui-min-page-width` keeps that much of the page beside a `sidebar` or `side` column: it caps
the column's width at the viewport less it, whether the width was dragged, set by
`--ag-ui-width`, or maximized. It is unset by default, which caps nothing.

```css
ag-ui-chat[placement="sidebar"] { --ag-ui-min-page-width: 480px; }
```

A host that wants its own sized state can still build it: hide the control
(`ag-ui-chat::part(maximize-button) { display: none }`), slot a button into `header-actions`, set
its own `--ag-ui-width` / `--ag-ui-height` in a class, and call `resetSize()` as it enters, so a
dragged size does not outrank its tokens.

### Driving the conversation from your own chrome

A host that lists conversations in its own bar, rather than in the built-in drawer, drives the
one on screen with the drawer's own paths:

- `switchThread(threadId)` — put a stored thread on screen and replay it, as picking its row in
  the drawer does. Returns a `Promise<void>` that resolves once the thread is drawn. **A run in
  flight is cancelled**, as the drawer and `newChat()` cancel it; read `running` first if you
  would rather wait. Switching to the thread already on screen does nothing, and so does a call
  before the element connects; a second call for the thread that is still loading settles with
  that load, after the replay. If the store rejects the load, the element stays on the thread it
  was on, redraws it, fires no `ag-ui-thread`, and the promise rejects with the store's error.
- `deleteThread(threadId)` — delete a stored thread, as the drawer row's delete does. Deleting
  the thread on screen cancels its run and puts a fresh thread in its place; deleting another
  leaves the screen alone. Prefer it to `conversationStore.clear()`, which deletes the record and
  nothing else: the run, the transcript and the drawer are left pointing at it.
- `threadId` *(read-only)* — the thread on screen, `null` before the element first connects.
  It only reads. `conversationStore.threadId()` mints and stores a thread when the store points
  at none, so asking it which conversation is showing can start one.
- `threadTitle` *(read-only)* — the title of the thread on screen, `""` while nothing has been
  sent in it. A title renamed here, or one the conversation list shows that the messages do not
  derive (a server's own), wins; otherwise it is the first user message, and a first message that
  is exactly a skill's `/token` reads as that skill's catalog `title`, else as the token in words
  (`/summarize_draw` reads "Summarize draw"). It is set on the first send, before the server lists
  the thread. Every change fires one **`ag-ui-thread-title`** event (`THREAD_TITLE_EVENT`, detail
  `{ threadId, title }`, typed `ThreadTitleDetail`), after the `ag-ui-thread` event of the change
  that caused it. `title-text="auto"` draws it without a listener.
- `running` *(read-only)* — whether an interaction is in flight: the composer's own state, the
  one it shows Stop for, across every tool round, a Retry and a checkpoint continuation as well
  as a send. Reflected on the element as the `data-running` attribute, written by the element
  rather than by you, as `data-empty` is, so the chrome around the chat can style on it.

Every change of conversation fires one **`ag-ui-thread`** event (the `THREAD_EVENT` constant),
after the transcript has been replaced, so a listener reads the conversation it is told about.
`detail` is `{ threadId, previousThreadId, reason }` (typed `ThreadDetail`). `previousThreadId`
is the thread the previous event reported, `null` before the first, and `reason` is one of:

| `reason` | When |
| --- | --- |
| `new` | `newChat()` or the built-in New chat button. |
| `switch` | `switchThread()` or a row picked in the drawer. Two switches made before the first had replayed report only the second. |
| `delete` | The thread on screen was deleted, and a fresh one took its place. |
| `restore` | The stored thread was replayed: when the element connects (`previousThreadId` is `null` the first time), or by `reload()`. |
| `rescope` | A `user-key` change handed the element to another principal, live or while it was out of the document. |

A page reload keeps restoring the thread, as [MPA durability](durability.md#mpa-durability-surviving-full-page-reloads) describes, and
reports it as `restore`. Ignore a `reason` you do not know: more may be added.

```js
chat.addEventListener("ag-ui-thread", (e) => myBar.markActive(e.detail.threadId));
myBar.onPick = (threadId) => chat.switchThread(threadId);
```

#### Open threads (tabs)

A host that draws conversations as tabs keeps the open set on the element rather than beside
it. The element draws nothing for it: the tabs are the host's chrome. **Tracking starts at the
host's first `openTab`**, which opens the thread on screen with it, or at connect when this tab
already stored a set. Until then nothing is kept, written or announced, so a host that never
calls `openTab` sees no change.

- `tabs` *(read-only)* — the open threads in the order they were opened, each
  `{ threadId, title }` (typed `ThreadTab`), frozen. `title` is `""` until one is known. Empty
  until tracking starts.
- `openTab(threadId, title?)` — open a thread as the last tab without showing it; `switchThread`
  shows it. Without a `title`, the store's list names it. A thread already open stays where it is.
- `closeTab(threadId)` — close a tab. **The thread stays in history**, which is what sets a close
  apart from `deleteThread`. Closing the thread on screen shows the next tab, else the one before
  it, else a new chat, cancelling a run in flight as `switchThread` does.

Once tracking has started, showing a thread opens it: `switchThread`, `newChat`, the drawer, a
[child-session](tool-calls.md#child-sessions) link and the parent breadcrumb each open the thread they show
(a link or breadcrumb a host prevents shows nothing and adds no tab), so the thread on screen
always has a tab, except when a closed tab's neighbour cannot be
loaded. A new chat leaving a thread nothing was sent in takes over that thread's tab, since the
store drops the empty thread. `deleteThread` closes the tab as it deletes the thread.

The set is kept per browser tab in `sessionStorage`, under the conversation's namespace (the
element's `id` and `user-key`, or, under `<ag-ui-agents>`, the agent's: `agent:<id>`, so each
agent keeps its own tabs), so a reload reads the same tabs back, titles included. A
`user-key` handover drops the previous user's tabs; a first `user-key` naming the user already
there keeps them.

Every change fires one **`ag-ui-tabs`** event (`TABS_EVENT`, detail `{ tabs, reason }`,
typed `TabsDetail`), with `reason` one of `open`, `close`, `delete`, `title`, `restore`
(connect or `reload()`) and `rescope` (a `user-key` handover). Ignore a `reason` you do not know.
A thread shown is in `tabs` by the time its `ag-ui-thread` fires, and its `ag-ui-tabs` follows.
Switching between two open tabs changes no tab, so mark the active one from `ag-ui-thread`.

```js
chat.addEventListener("ag-ui-tabs", (e) => myTabs.draw(e.detail.tabs));
chat.addEventListener("ag-ui-thread", (e) => myTabs.markActive(e.detail.threadId));
chat.openTab(chat.threadId); // start tracking
myTabs.onPick = (threadId) => chat.switchThread(threadId);
myTabs.onClose = (threadId) => chat.closeTab(threadId);
```

### The composer's own keys

**Enter during a run queues.** A second run cannot start while one is in flight —
it would orphan the first — so that key used to do nothing at all, silently. A
checkpoint continuation picked from the panel counts as in flight from the pick
rather than from its first event, which is a request later, so a turn typed in
that gap is parked too rather than racing it. What
is waiting shows above the composer as chips, each of which takes its message
back when pressed, and the next one is sent when the run settles. Stopping the
run discards them: sending into a conversation someone has just stopped is the
opposite of what stopping meant. Nothing is lost, though — a queued message
entered the recall history below when it left the composer, so **Up** gets it
back after a Stop, and after its chip is taken back.

The composer also walks back through what you have already sent, on **Up** and
**Down** — the shape every shell and every coding agent uses. It holds every turn
that left the composer: one sent at once, one queued behind a run (from the
moment it is queued), and one sent to resume or fork a run from the checkpoint
panel. A message sent with `sendMessage` is not in it, because it was never
typed there. Only from an empty composer and only with the skills palette closed:
an arrow inside text is how you move the caret, and taking it unconditionally
would break editing to add a shortcut. Arrowing forward past the newest turn
empties the box again, so the way out is the key that got you in. A walk lasts
only while the composer holds the turn it put there: anything else that writes
the box — typing, a quotation, a skill, dictation, or the host page itself — ends
it, so the next arrow moves the caret in what was written rather than replacing
it. The history is this conversation's: starting a new chat, switching threads
or changing `user-key` clears it with the transcript.

### Collapsing to the launcher

A collapsed widget shrinks to a **floating launcher** in the corner it already occupies: the
panel scales down into it and fades, the launcher grows out of the same point, and clicking the
launcher reverses it. Only `transform` and `opacity` animate, so the motion is compositor-only and
never reflows your page. Two placements collapse to something else instead — `sidebar` slides out
to its [edge rail](theming.md#sidebar-placement), and `embedded` / `page` keep the header bar, since one is
laid out by your page and the other is a full-screen route.

The launcher's mark comes from the same seam as the header icon, most specific first: a slotted
`slot="launcher"` child, then `data-launcher-icon-url`, then `data-icon-url`, then the built-in
speech bubble.

```html
<ag-ui-chat endpoint="/agent/" data-launcher-icon-url="/mark.svg"></ag-ui-chat>

<!-- or any markup at all -->
<ag-ui-chat endpoint="/agent/">
  <svg slot="launcher" width="26" height="26"><!-- ... --></svg>
</ag-ui-chat>
```

```css
ag-ui-chat {
  --ag-ui-launcher-size: 48px;
  --ag-ui-launcher-radius: 14px;  /* 50% for a circle */
  --ag-ui-launcher-bg: #14532d;   /* defaults to the panel background */
  --ag-ui-launcher-fg: #ffffff;   /* defaults to the text colour */
  --ag-ui-launcher-icon-size: 22px;
  --ag-ui-launcher-inset: auto 0 0 auto;  /* which corner of the widget's box */
}
```

The sizes and defaults above are Quiet's. The other themes bring their own launcher: `classic`
the 56px circle in the header's colours, `soft` a 56px accent tile, and `ledger` a 44px tile in
the text colour.

> **The collapsed host keeps its box.** Animating the element's own width and height would animate
> layout; instead the box stays put with `pointer-events: none`, and the launcher takes the clicks.
> A host measuring `getBoundingClientRect()` on a collapsed widget still sees the panel's
> footprint — nothing there paints or takes input.

#### The unread badge

A collapsed widget is the one state where an answer can arrive with nothing on screen to say so,
so the launcher carries a count of the answers that finished while it was closed (capped at `9+`).
It is the only affordance here that is **on by default**; `data-unread-badge="false"` turns the
badge off.

**Unseen answers are kept per thread.** Each answer counts against the thread it ran on, and a
thread is read only when it is on screen **and** the panel is expanded. On screen in a collapsed
panel is not read. So an answer that finished on thread A while collapsed stays unread across a
collapsed switch to B, a `newChat()`, or an expand on B, and is read once A is on screen in the
open panel. `unread` is the total across threads, which is what the badge shows; it shows on the
collapsed launcher only, so an open panel whose other threads hold unseen answers shows no
badge. A principal change (a new `user-key`) drops the previous principal's marks, and deleting a
thread drops its own.

A store can carry read state across pages and devices, through two optional members. The element
fetches the thread list when the drawer opens or a thread switches, not at page load, so a
store's `unread` rows are counted from that fetch on: a page that never opens the drawer shows
no badge for answers that finished elsewhere.

- **`ThreadMeta.unread`** (boolean): a thread `listThreads()` reports as unread, and the page has
  not counted, counts once, when the list is fetched.
- **`markRead(threadId)`**: called when the element reads a thread with unseen answers, and when
  the run of an answer that finished on the thread in view settles (after the answer, so a server
  has saved it first). A server store maps it to its read endpoint, and
  should list the thread with `unread: false` afterwards.

A store without either still has its threads counted and cleared in the page. Neither is
implemented by the default `SessionStorageStore`.

The count is also the launcher's accessible name (`Expand — 2 unread`, from the `expandUnread`
string), because a coloured dot says nothing to a screen reader.

#### Moving the launcher

The collapsed launcher can be dragged anywhere on screen, and it stays there — per tab, in
`sessionStorage`, namespaced per element exactly like the collapsed, theme and size preferences.
Arrow keys move it from the keyboard (`Shift` for a larger step). `data-launcher-drag="false"`
turns it off; so does any placement that already places the launcher itself — `sidebar` collapses
it to a full-height rail, `embedded` and `page` hide it and keep their header bar, and a
full-bleed panel has no clear space to open into.

**The panel then opens into whichever side of the launcher has more room.** For each axis the
element compares the space a panel would have on either side of the launcher and pins the side
with more of it, so a launcher dragged to the top-left opens down and to the right. What it
compares is the room the *panel* would get, not which half of the screen the launcher is in —
those give different answers either side of centre, and only the first one is about whether the
panel fits.

A launcher parked where the panel fits neither way — the middle of a short viewport — keeps its
position anyway: the panel is clamped into the viewport and the launcher carries the difference,
which is why it can end up sitting outside its own host box. Nothing clips it there.

A drag writes `--ag-ui-inset` and `--ag-ui-launcher-inset` on the host, and an inline custom
property outranks your stylesheet's rule for the same one — the same trade a dragged size makes
against a placement. Switching to a placement that places itself hands both back.

> **An undragged launcher is untouched.** With nothing stored, the element writes neither
> property and your CSS decides, exactly as before. The geometry is built so that feeding it the
> resting position reproduces the default `auto 24px 24px auto` unchanged.

#### Moving the panel

An open panel moves by its **header**, the way a window moves by its title bar.

**The launcher travels the same distance.** Drag the panel 100px left and the bubble it collapses
into is 100px left of where it was — it is one widget being moved, not two things being placed.
The distance is the panel's own, so a panel held against the viewport's margin stops and the
bubble stops with it, and the bubble is then held on screen in its own right.

**A position you state is kept, not re-derived.** That is the difference between the two drags: a
launcher drag says where the bubble goes and lets the panel open into whatever room the viewport
has, which is re-decided on every expand and every window resize; a header drag states the
panel's own position, so it survives collapsing, reopening and reloading. Dragging the bubble
again hands the decision back. Both are stored per tab, and `data-launcher-drag="false"` turns
off both.

Which corner the panel is *pinned* by is re-picked when the drag ends, from where the bubble has
ended up, so the next expand still opens into clear space. Re-picking it moves nothing: the
corner only says which edges the two insets are written from, and both are written from positions
that are already decided.

The controls in the header keep their own presses — a drag started on a button, a link or a field
never begins, including one you slot in.

There is no keyboard shortcut on the header, deliberately. A header is not a control, and making
it focusable would put a tab stop with no role ahead of the controls a keyboard user came for —
while arrow keys on the collapsed launcher already move the widget, panel included.

```js
chat.unread; // 2

// Every change, whether or not the badge renders it — so a host that hides the
// badge can put the count in its own chrome. `threadIds` names the threads the
// change marked or cleared, and is empty for a collapse toggle that touched none.
chat.addEventListener("ag-ui-unread", (e) => setDockBadge(e.detail.unread, e.detail.threadIds));
```

```css
ag-ui-chat {
  --ag-ui-badge-bg: #b91c1c;   /* defaults to --ag-ui-danger */
  --ag-ui-badge-fg: #ffffff;
  --ag-ui-badge-size: 18px;
  --ag-ui-badge-font-size: 11px;
}
```

### Collapsing to a bottom bar

`collapse-to` chooses what a collapsed panel becomes, for a host whose layout has a bottom
toolbar. It is opt-in: absent, `auto`, or any other value leaves every placement as the
sections above describe. It is live, like `placement`.

- **`bar`: the component's own bar.** A strip along the whole bottom edge of the viewport, in
  place of the round launcher: the title, the [unread badge](#the-unread-badge), and a running
  indicator while an interaction is in flight. Pressing the strip toggles the panel, which rises
  from the bar's right end with the bar still beneath it as the minimise target. The bar's
  history button opens the conversation list as a popover above the bar, without expanding the
  panel, its outer edge in line with the panel's on a wide viewport, and a second press closes
  it; `openThreads()` while collapsed opens it too. Expanding the panel closes the popover, so the
  panel opens on the conversation. It replaces the launcher only, so it applies to the corner
  placements, `side` and `full`: `sidebar` keeps its rail, `embedded` its header bar, and `page`
  has no collapsed state at all.
- **`none`: your own bar.** Collapsed is hidden: nothing of the widget is left to see or hit,
  under every collapsible placement. Your bar's button drives the [public
  API](#driving-the-conversation-from-your-own-chrome) (`collapsed`, `toggleCollapsed()`), and
  `anchor` names the element the panel rises from, right-aligned to it. An anchor that resolves
  to nothing opens the panel from the placement's own corner, with one console warning.
  While collapsed, `openThreads()` opens the conversation list as a popover beside the anchor,
  or beside the element you pass as `openThreads({ anchor })`, which wins over the attribute and
  property for that call. It opens below a button in the top half of the viewport and above one
  in the bottom half, right-aligned to it and held inside the window (full width less 8px on a
  phone). Picking a conversation switches to it and closes the list, and leaves the panel
  collapsed: you get `ag-ui-thread` and decide whether to expand. Escape, a press outside,
  `closeThreads()` and expanding the panel close it; a press on the button itself does not, so
  your button can toggle the list. With no anchor at all, `openThreads()` warns once per call
  and draws nothing. `embedded` hides the whole element while collapsed under `none`, so it has
  no popover.

```html
<nav class="toolbar">
  <!-- ... -->
  <button id="agent-button" type="button">Agent</button>
</nav>
<ag-ui-chat endpoint="/agent/" collapse-to="none" anchor="#agent-button"></ag-ui-chat>
<script type="module">
  const chat = document.querySelector("ag-ui-chat");
  const button = document.getElementById("agent-button");
  button.addEventListener("click", () => chat.toggleCollapsed());
  // Under none the element announces the state it mounted in, once, so the
  // button can be labelled before anyone presses it.
  chat.addEventListener("ag-ui-toggle", (e) => {
    button.setAttribute("aria-pressed", String(!e.detail.collapsed));
  });
</script>
```

**Clearing your toolbar.** Under `none` the panel stands `--ag-ui-anchor-gap` (default `8px`)
above the anchor's top edge. The anchor is the button, not the toolbar around it, so a button
sitting inside a taller toolbar puts the panel's foot across the toolbar's top border. Set the gap
to the button's distance from the toolbar's top plus the clearance you want:

```css
/* The button stands 7px below the toolbar's top edge; clear it by 8px. */
ag-ui-chat {
  --ag-ui-anchor-gap: 15px;
}
```

A gap wider than the gutter is taken off the panel's max height as well, so a tall panel still
stops at the top of the window.

**A button in a header.** The panel opens on the side of the anchor with more room, so a button
in a top header opens it below the button and one in a bottom bar opens it above, with no inset
of your own. `anchor-side="above"` or `"below"` fixes the side; `auto`, the default, decides again
when the window is resized (never during a drag), so an anchor near the middle of the window can
change sides. Below the anchor the gap is measured from the button's bottom edge, and the max
height is the room under it less one gutter. On either side the panel lines up with the anchor's
right edge unless that would put either edge inside the 24px gutter of the window, where it stops
instead; its width cap is the window less two gutters, maximized included.

```html
<ag-ui-chat endpoint="/agent/" collapse-to="none" anchor="#agent-button" anchor-side="below"></ag-ui-chat>
```

Under `none` the element dispatches `ag-ui-toggle` once as it connects, with whichever state it
mounted in, collapsed or open. Under `auto` and `bar` it does not, as before. That event touches
neither the stored state nor the unread count.

**The page's space is yours.** The bar is fixed over the page, so a host pads its own page by
the bar's height. The component never writes your CSS, and a custom property cannot carry the
height up to your page (it inherits down, never up), so it hands you a number:
`barHeight` (CSS px, read-only) and an `ag-ui-bar-height` event (the `BAR_HEIGHT_EVENT`
constant, detail `{ height }`) on every change, including a font-size change. Both read `0`
where no bar is drawn: under `auto` and `none`, on a phone while the panel is open, and while your
size fills the window with the panel open. If you write the height into
`--ag-ui-viewport-inset-bottom`, a panel that fills the box that leaves stays judged against that
box once the bar goes and the box grows by the bar's height: it settles with the bar gone and room
at its foot. Writing some other share of the height does not settle; publish it to your page as below.

```js
const chat = document.querySelector("ag-ui-chat");
const pad = () => {
  document.documentElement.style.setProperty("--chat-bar-height", `${chat.barHeight}px`);
};
chat.addEventListener("ag-ui-bar-height", pad);
pad();
```

```css
body {
  padding-bottom: var(--chat-bar-height, 0px);
}
```

**A fixed sidebar pushes your page the same way.** A docked `placement="sidebar"` (or `"side"`)
is fixed over the page, so `dockWidth` (CSS px, read-only) and an `ag-ui-dock-width` event (the
`DOCK_WIDTH_EVENT` constant, detail `{ width, side }`, `side` being `"left"` or `"right"`, as
`data-side` says) hand you the width it covers at rest: the panel's width while open, the rail's
(`--ag-ui-rail-width`, 52 by default) while collapsed to it, and `0` under `collapse-to="none"` or
a launcher, under every other placement, on a phone while the panel is open, and under
`--ag-ui-position: static`, where your own layout already makes room. The event fires once per
change of the resting value, never per frame of the width transition, and once at the end of a
resize drag.

```js
const chat = document.querySelector("ag-ui-chat");
const push = () => {
  const { dockWidth: width } = chat;
  const side = document.querySelector("ag-ui-chat").getAttribute("data-side") ?? "right";
  document.documentElement.style.setProperty("--chat-dock-left", side === "left" ? `${width}px` : "0px");
  document.documentElement.style.setProperty("--chat-dock-right", side === "left" ? "0px" : `${width}px`);
};
chat.addEventListener("ag-ui-dock-width", push);
push();
```

```css
body {
  padding-left: var(--chat-dock-left, 0px);
  padding-right: var(--chat-dock-right, 0px);
}
```

**No inset needed.** Under `bar` and `none` you do not set `--ag-ui-inset` to keep the panel off
your toolbar: its max height is the viewport less the bar's height (or, under `none`, the
distance to the anchor's top, or below it from the anchor's bottom) and one gutter, and its
bottom sits on the bar or the anchor (its top, when it opens below).

**Docked, and still movable.** On a wide viewport a docked corner panel (the corner placements
under `bar`, or under `none` with or without an anchor) moves by its header, and `moveTo` moves
it, as it would the corner panel it is; `describeSurface()` reports `movable: true`. There is no
launcher to drag: the bar and your own control stay where they are.

- **Above the dock.** A dragged panel stays inside the viewport and above the bar's top edge, so it
  never covers the bar it minimises to. Under `none` with an anchor it stays above the anchor's
  top edge the same way (below its bottom edge, when the panel opens below it), because the
  anchor is your own way back and has to stay in view;
  `--ag-ui-anchor-gap` no longer applies once the panel is dragged, and the screen-edge margin
  (8px) does. Under `none` with no anchor only the viewport holds it, as for a corner panel.
- **Remembered like a corner panel.** Minimising and reopening brings it back where it was
  dragged, and so does a reload. The spot is kept apart from the one a corner panel stores under
  `auto`, so switching `collapse-to` never puts one surface's spot on the other. A spot that no
  longer fits, because the window shrank or the bar grew, is held inside the room that is left
  and comes back whole when there is room again.
- **Resizing.** A panel standing on its dock keeps the edges on the bar or the anchor still and the
  free ones follow the grip. Once dragged off, every edge follows its grip, as on a corner panel.
- **Back to the dock.** `resetSize()` drops the placement's dragged size and returns the panel to its dock,
  forgetting the stored spot, so a reload opens it there too.
- **Keeping it fixed.** `data-launcher-drag="false"` turns the header drag and `moveTo` off here as
  everywhere else, and the panel stays on its dock.
- **A host's size that fills the window.** Set `--ag-ui-width` and `--ag-ui-height` to the whole
  window, with `--ag-ui-max-width` and `--ag-ui-max-height` out of the way (the defaults stop short
  of it), and the panel stands at the start of the room you left free, whether it was moved or not.
  The bar and the grips go while it does, as on a phone, with `barHeight` at 0 and the header's
  minimise control as the way back. The bar comes back when the panel is collapsed, and both when
  your size stops filling. The stored spot stays, and the panel goes back to it, or to its dock,
  once your size stops filling. An inline `--ag-ui-inset` of your own stays where you wrote it.

Placements that own their position (`side` and `full` under `bar`, `sidebar` and `embedded`
under `none`) do not move, as without `collapse-to`.

**Phones.** At 600px or less the open panel stays full-bleed, over the bar, and the header's
minimise control is the way back; the bar shows only while collapsed, so no second strip sits
at the bottom edge while the keyboard is up. The panel does not move there, and a spot dragged on
a wide viewport does not apply: it comes back when the window is wide again.

The bar is styled through the parts `bar` (the strip's wrapper, holding the launcher, the place and
the history button) and `bar-history`, and the launcher's own parts (`launcher`, `rail-label`,
`launcher-badge`) inside it.

**The place in the bar.** When [`getPlace`](host-seams.md#where-the-user-is-the-place-chip) (or the route map
standing in for it) names a place, the strip shows it beside the title as quiet secondary text: the
`bar-place` part holding `place-label` and `place-detail`, the parts the chip uses. It comes from
the chip's one read, so `refreshPlace()`, `popstate` and a withheld place update it as they update
the chip. A long place truncates with an ellipsis before the history button leaves the strip, and
no place draws nothing. A place the user withheld stays in the strip dashed and struck through
(`data-excluded` on `bar-place`), because the bar must not claim the page is sent. The phone strip,
shown while collapsed, carries it too.

## Resizing the panel

The panel carries a grip on **every edge and every corner**, so it can be
dragged from whichever side you are already near.

- `placement="page"` gets **no grips** — a full-bleed layout
  is `100vw`/`100vh` by definition, so there is nothing to drag.
- `placement="sidebar"` keeps only the two vertical edges;
  the placement owns the height, so a horizontal edge or a corner would
  advertise a drag that does nothing.
- Everything else gets all eight.

**The edge a grip does not drag is the one that stays put.** That is the whole
model: the left grip moves the left edge and holds the right, the right grip
does the reverse, a corner does both axes. A grip names its own edge, so no
layout can invert it.

### Dragging the edge your layout was holding still

A floating panel pinned bottom-right cannot grow rightward on its own — its
right edge is what the placement fixed. So **a drag on a pinned edge moves the
panel as well as resizing it**, and the component takes the position over by
writing `--ag-ui-inset`, the same ownership a dragged launcher takes.

A grip on a free edge writes nothing but the size, exactly as before, so a host
positioning the panel with its own rule keeps that rule until someone drags the
edge it was holding.

Which edges those are belongs to *your* CSS rather than to `placement` — a
floating panel a host right-aligns is anchored bottom-left — so the element
probes its own geometry and reflects the result as `data-resize-anchor` (e.g.
`bottom-right` means those two edges are fixed). Nothing in the stylesheet reads
it any more; the element uses it to decide what a drag on a pinned edge costs,
and which grip carries the keyboard.

> **The probe shrinks rather than grows.** Growing by a pixel cannot answer the
> question at a size already resting against `max-width` or `max-height`: the
> box does not change, no edge moves, and every clamped axis reads as pinned on
> the side that is actually free. That was reachable with no user action at all
> — the default panel is 380px wide against a max-width of `100vw - 48px`, so
> any viewport under 428px was born clamped, with the grip on the wrong corner
> and the drag inverted.

### Sizes, keyboard, and parts

A drag writes the private `--_drag-width` / `--_drag-height` on the host, not
your `--ag-ui-width` / `--ag-ui-height` tokens, which stay yours. The precedence
is:

- **Above 600px**, the dragged size beats a host's `--ag-ui-width` /
  `--ag-ui-height`, `!important` included, so a user who resized the panel keeps
  their size. A host that enters a sized state of its own (an "expanded" class)
  calls `resetSize()` when it does, which drops the current placement's dragged
  size and its stored copy and hands control back to the host tokens. A host
  with no such state needs nothing.
- **Per placement.** A dragged size belongs to the `placement` it was dragged in
  and is stored under it: absent and `floating` share one, and `bottom-left`,
  `sidebar`, `side` and `embedded` each keep their own (`data-side` is not a
  placement, so a left and a right sidebar share one). Switching `placement`
  swaps in the new placement's size, or its default when it has none, so a
  placement switch needs no `resetSize()`. A `collapse-to` change keeps the size.
  A size stored by a release before this one is read as floating's.
- **At 600px or less**, the small-viewport shape ignores the dragged size
  entirely, for the placements that block covers (`floating`, `bottom-left`,
  `sidebar`, `side` and the default): the panel is full-bleed whatever was
  dragged or stored, and a window narrowed after a wide-window drag goes
  full-bleed too. `page` is already that shape, and `embedded` is left to the
  host's own box, so neither is touched by the block. `data-small-viewport="off"`
  keeps a dragged size at every width on the covered placements.

A dragged size is a private property, so a host should not read it back from
the element's inline style; use `getBoundingClientRect()`, or `resetSize()` to
clear it.

**A custom property alone does not leave placement in charge** — an inline custom
property still outranks a `:host([placement=…])` rule setting the same property. So the
component enforces the split directly: **a placement owns the axes it fixes**,
and a dragged or persisted size is only ever applied to the ones it leaves free.
Switching placement hands the owned axes back. Without that, a height dragged
while floating capped a docked sidebar that had asked for `100vh`.

**A host rule that sizes the element wins over both.** `ag-ui-chat { flex: 1 }`
stretches the panel to its container and the dragged width has no visible
effect — which reads as a broken control rather than as your stylesheet winning.
Give the element `flex: 0 1 auto` (plus `max-width: 100%`) if it lives in a flex
container.

The size persists per tab (`sessionStorage`, namespaced per element like the
collapsed and theme preferences) and is restored before the first paint.

**Exactly one grip is in the tab order** — the corner diagonally opposite the
pinned one, so an arrow key changes the size and never the position. Eight
separators between the transcript and the composer would be a keyboard
obstacle rather than keyboard parity, and one grip already reaches both axes.
Arrow keys resize from it (`Shift` for a larger step).

Each grip draws a short pill centred on its edge — a dot in a corner — on hover
and focus as well as during a drag. **The hit area and the mark are separate on
purpose**: the area is the whole strip, so the grip is easy to catch, while the
mark stays small enough that it cannot be read as a border and never meets the
panel's corner radius.

Every grip has its own part (`resize-handle-left`, `resize-handle-bottom-right`,
and so on, plus `resize-handle` on all of them). Hit areas and marks are sized
separately, so a coarser pointer can get a bigger target without a heavier mark.

```css
ag-ui-chat {
  --ag-ui-grip-corner: 20px;          /* the corner squares */
  --ag-ui-grip-edge: 10px;            /* the edge strips */
  --ag-ui-grip-mark-length: 28px;     /* the pill drawn inside them */
  --ag-ui-grip-mark-thickness: 3px;
}
```
