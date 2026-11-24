# Durability and resuming

## MPA durability: surviving full page reloads

In a multi-page app, a tool that navigates reloads the whole page and destroys the in-memory run
loop. The package keeps the conversation continuous across that boundary with three generic
mechanisms.

**1. Thread identity.** AG-UI's `thread_id` is the conversation key. It is generated once and
persisted (so the element reattaches after a reload) by the
[`ClientConversationStore`](https://github.com/Artui/agents-web-components/blob/main/src/core/conversation_store.ts).

**2. Durable conversation.** A pluggable `ClientConversationStore` holds the message list. The
default [`SessionStorageStore`](https://github.com/Artui/agents-web-components/blob/main/src/core/conversation_store.ts) keeps everything per-tab in
`sessionStorage`, so the chat survives full page reloads and clears on tab close. `loadMessages`
is async-friendly, so a host can inject a server-backed store (e.g. one that rehydrates from a
history endpoint) for cross-tab/device durability:

```js
chat.conversationStore = new MyServerBackedStore();
```

On mount the element rehydrates the transcript from the store, so the chat looks continuous —
including tool-call cards and their results (reconstructed from the persisted `toolCalls` and `tool`
messages), not just the text turns.

A tool message is saved with an **`outcome`** in its `metadata` when the call did not simply
succeed, in the same vocabulary the wire uses (see [A tool call that failed](concepts.md#a-tool-call-that-failed)),
so a failed or declined card replays as failed or declined instead of turning green on reload. A user
message keeps the refs of its uploads the same way, under `attachments` in its `metadata`. Both
round-trip through `JSON.stringify` in the default store. **A store that drops `metadata` loses only
the distinction** — the card falls back to *done*, which is what it did before, and the bubble loses
its chips.

What is saved is exactly what the next request sends, so both go back to the server on every run.
That is the protocol's own behaviour for a declared field rather than a client-side addition: a server
validates `metadata` as an open object, and one that does not read a key ignores it — django-ag-ui
reads `attachments` and ignores `outcome`.

A conversation stored by an earlier release has both keys at the top level of the message instead.
The history replay reads them from there when the metadata has none, and a client seeded from such a
conversation moves them into `metadata` before its first request, because `@ag-ui/client` 1.0 would
strip them from the request as it stands. The next save writes them in the new shape.

**3. Resumable loop (`x-navigates` + `navigationResult`).** A tool whose schema carries
`x-navigates: true` (use `X_NAVIGATES_KEY`; read back by [`isNavigates`](https://github.com/Artui/agents-web-components/blob/main/src/tools/is_navigates.ts))
triggers a full reload. Before the handler navigates, the element writes a checkpoint
(`{ toolCallId }`) to the store. On the next page mount it:

1. restores the transcript,
2. completes the dangling navigating tool call by supplying a result built from the landed page
   via the overridable **`navigationResult(checkpoint)`** callback (defaults to
   `{ navigated: true, url }`; a host can return a page snapshot or post-reload validation errors
   instead),
3. and resumes the run loop from there.

The MPA round-trip becomes a clean observation point instead of a dropped conversation.

**A reload the run did not expect settles every open call as not finished.** A round's history is
saved when its stream ends, before the element asks about a gated call, runs a frontend tool or
collects a server-side approval, so a reload in that window finds the round's calls with no result
and no run left to produce one. On restore, every call without a result (other than a checkpointed
navigating call) is answered the way the client answers an open call before a request: its card
settles as `interrupted` ("not finished"), and the restored conversation gains the `callNotFinished`
result with the outcome `interrupted`, so the next request carries a result for every call and a
later reload shows the same.

It is not declined, although Stop declines an open card. Pressing Stop is a person answering the
question; a reload answers nothing. The saved history is the same whether the round was waiting on a
person or on a frontend tool the reload killed, so a decline would be unproven for one and false for
the other, and "not finished" is true of both. The same goes for a server-side approval left open.

### Who the stored conversation belongs to (`user-key`)

`sessionStorage` is scoped to a tab, not to a session. It survives every same-tab navigation,
and a logout is a navigation — so on a shared workstation, one user's transcript is still sitting
there when the next user signs in and the chat mounts again. Transcripts routinely quote record
data, so treat that as the default and turn it off:

```html
<ag-ui-chat endpoint="/agent/" user-key="{{ request.user.pk }}"></ag-ui-chat>
```

The value is any string that identifies the principal — a user id, an account id, a hash of one.
It joins the storage namespace, so two principals in the same tab cannot reach each other's
conversation, and **changing it purges everything the previous principal stored**: transcript,
history drawer index and navigation checkpoints, for this element's namespace only. The tools they
waived with *Always allow* are forgotten with it, so the next principal is asked again, and so is
[`sharedState`](host-seams.md#host-seams-the-spa-story): whatever the agent last wrote into it for them is cleared rather than
sent on the next principal's first run, so a host that seeds shared state assigns it again for the
principal who arrived.

A handover also ends what the previous principal had in flight. Their run is stopped, and nothing
it does afterwards is written into the next principal's storage or shared state: not the save a
stopped run makes once its request closes, not a tool result that comes back after the Stop, not
state already on its way. A tool call still waiting on `confirmPredicate` or its confirmation card
does not run, one whose handler is still running draws nothing when it returns, and a navigating
tool's checkpoint is never written into the next principal's thread. What they had typed into the
composer and not sent is cleared with the transcript, quotations and skill templates included. A
voice recording in progress is stopped before it is transcribed, and a clip already sent for
transcription is dropped when its transcript comes back.

Set it live, from script, as part of signing out or in:

```js
chat.userKey = String(session.userId); // or "" on sign-out
```

That is why it is a live attribute rather than a connect-time one. A single-page app signs a user
out through its own router without remounting anything, so the host naming the new principal — or
dropping the attribute — is the only signal the element will ever get. Removing the attribute
purges too, so a sign-out that simply clears it is safe.

It holds for an element that is out of the document too, such as a view a router keeps alive.
Nothing is purged while it is detached: the handover runs when it is inserted again, against the
key it has by then, so a key that changes and changes back while detached hands nothing over. An
element that is never inserted again leaves the previous principal's conversation in
`sessionStorage` under their key, where only an element naming that principal again can reach it.

The **first** value to arrive is treated as a host naming the user who was already there, not as a
handover: the conversation in progress moves into the principal's namespace instead of being
destroyed. So an element configured by an async auth handshake — the shape described in
[Framework hosts](authentication.md#framework-hosts-configure-before-you-insert) — keeps what is on screen,
including a run still streaming and whatever is in the composer.

Two things it deliberately does not do. It does not scope the panel's own collapsed / dragged-size
/ theme preferences, which are this element's UI state and carry no conversation content. And it
does not encrypt or hide anything from the page: any script on the origin can still read
`sessionStorage`. It scopes and it purges.

**Without it, nothing changes** — including the carry-over above. A conversation is scoped to the
element and to nobody in particular, and on a shared workstation it will be there for whoever signs
in next in the same tab.

For a deployment that keeps history server-side, `data-threads-cache="false"` stops the local
mirror of the message bodies as well, so choosing `data-threads-url` actually keeps transcripts off
the client:

```html
<ag-ui-chat endpoint="/agent/" data-threads-url="/agent/threads/" data-threads-cache="false">
</ag-ui-chat>
```

The client-only concerns (the active thread id, the navigation checkpoint) keep their local store
either way, so reloads and navigating tools still work. What is lost is the offline fallback: when
the thread endpoint is unreachable the transcript comes back empty rather than stale, and the
drawer's offline list loses its previews — a preview being an excerpt of a message, which is the
thing being kept off the client. Constructing the store yourself takes the same option:

```js
chat.conversationStore = new RemoteConversationStore(
  "/agent/threads/",
  () => ({ "X-CSRFToken": token }),
  new SessionStorageStore(),
  () => "same-origin",
  false, // cacheMessages
);
```

`RemoteConversationStore.local` *(read-only)* is the store it keeps the client-only state in (the
thread pointer and the navigation checkpoint): the third constructor argument, a
`SessionStorageStore` by default. A host wrapping the chat's store reads it to reach what the
remote delegates.

A conversation store you assign yourself is never replaced by a change of `user-key`, whether you
assign it before the element connects or after. The one exception is a plain `SessionStorageStore`
assigned before the element connects: that is the same kind as the element's own default, which is
all connecting can see, so the element namespaces it as its own and moves it on every key change.
Assign it after connecting, or wrap it, to keep it yours. A store that keeps its data somewhere
the element cannot see has to scope itself; the element purges only its own `sessionStorage`
namespace and clears what is on screen. If your store wraps a `SessionStorageStore`, build a new
one per principal.

`SessionStorageStore.purge(namespace)` is the same primitive the element uses, for a host driving
its own store from its own sign-out path.

### Mounting more than one chat on a page

Give each `<ag-ui-chat>` its own `id`. The storage namespace is the element's `id`, falling back to
its `endpoint` — so two elements with no `id` against the same agent mount (a docked support panel
and an inline page assistant, say) would resolve to the same namespace and share a thread pointer,
a history drawer and every message key.

They no longer do: the first element to mount keeps the namespace, and a second is given a
throwaway one of its own plus a console warning. That keeps the two conversations apart, but the
throwaway namespace is minted per mount, so the second element will not restore its conversation
across a reload until it has an `id`.

## Resuming a run

When the server persists run checkpoints (django-ag-ui's `step_store`), a run
that stopped part-way can be **continued** rather than restarted. Point the
component at the run index and a checkpoints button (an arrow turning back) appears in the header:

```html
<ag-ui-chat endpoint="/agent/" data-runs-url="/agent/runs/"></ag-ui-chat>
```

The panel lists runs the server marked **continuable** — those with a saved
snapshot to seed from. A run that never reached a provider-valid boundary has
none, so it isn't offered: resuming it would start from nothing.

A row leads with the run's **first user message**, from the index's `preview`
field, and shows when it started beside it. That is what makes the list a list of
conversations: a time is not an identity, since two runs a minute apart both read
"just now", and a run id is not something a person recognises. Where the server
sends no preview — an older index, or a run that opened on an image with no
caption — the row falls back to the time plus the first eight characters of the
id (full id on hover, for correlating with server logs), and so does a row whose
preview another row repeats: words shared with a second row identify neither, and
one board tends to be asked about more than once. Either way a run that branched
from another is marked, so a fork doesn't read as a duplicate of its parent.

Type the next turn in the composer, then pick a row:

- **Resume** — continue that run.
- **Fork** — branch it, leaving the original untouched.

Both send to the matching server endpoint and stream into the same transcript. The
turn you typed is drawn there ahead of the answer and announced with `ag-ui-submit`,
exactly as a send is, so a host that keeps its own record of what the user said sees
continued turns too.

Picking a row with an empty composer says so above the input and puts the caret
there, rather than closing the panel over nothing: a continuation sends **only**
the new turn, so with nothing typed there is nothing to send.

Picking a row while an answer is still streaming — the conversation's own, or
another continuation's — is refused the same way: the hint asks you to wait or
stop it, and what you typed stays in the composer for the pick after. The run in
flight is not cancelled for you, since a continuation starting over it would
leave two answers streaming into one transcript with Stop reaching only one.

Picking a row while a stored conversation is still loading is refused the same
way, with a hint asking you to wait for the load: a continuation sends only the
new turn, so it must not start before the history it continues is on screen. The
wording is the `continueWhileLoading` string.

### One URL, three endpoints

`data-runs-url` is the only thing to configure. `resume/<id>/` and `fork/<id>/`
are siblings of the index — django-ag-ui mounts all three under one prefix
whenever a step store is set — so they're derived, and there's no way to end up
with a half-configured set.

### The client contract, handled for you

Those endpoints expect a request carrying a **fresh run id** and **only the new
turn**: the server supplies the prior turns from the snapshot, so re-sending
them would duplicate the conversation.

The component satisfies that structurally rather than by remembering a rule. A
continuation runs on its own short-lived agent, built pointing at the resume
endpoint and seeded with **no** history — so "only the new turn" is the only
thing it *can* send, and the fresh run id comes free because a new agent mints
one. Nothing of the conversation's history goes out on its request.

A resumed run is a normal run in every other respect: frontend tools execute,
approval interrupts render their card, `headers` are re-read per request so
a rotated CSRF token or JWT still reaches the endpoint, it carries and updates
[shared state](host-seams.md#host-seams-the-spa-story) like any other run, it is bounded by
`data-max-tool-rounds`, and Stop ends it. Its client is built by the same
construction as the conversation's own, differing only in the endpoint and the
empty seed.

The continued exchange joins the conversation. Its agent holds only the new turn
and the answer, and a store keeps one message list per thread, so each save
writes the conversation as it stood when you picked the row with the exchange
after it — through the same `saveMessages` as any other run, and as far as it
got if it was stopped. A reload then replays the exchange, and the next message
you send, now to `endpoint` again, carries it together with the shared state the
continuation left. What is saved is what the transcript shows: a fork's exchange
follows the conversation it was picked from, in that same thread.

If the index can't be reached, the panel shows its empty state rather than an
error — a history affordance that fails is empty, not broken.
