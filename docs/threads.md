# The conversation list in your own chrome

`<ag-ui-threads>` lists a chat's conversations where you put it: as rows in a rail, or as pills
in a bar. It keeps nothing of its own. It reads the chat's `conversationStore`, marks the thread
on screen as current, and drives the chat through the [thread API](header-and-panel.md#driving-the-conversation-from-your-own-chrome).

```html
<header>
  <ag-ui-threads for="chat" variant="pills"></ag-ui-threads>
</header>
<aside><ag-ui-threads for="chat"></ag-ui-threads></aside>
<ag-ui-chat id="chat" endpoint="/agent/"></ag-ui-chat>

<script type="module">
  import { defineChat } from "@artooi/agents-web-components/chat";
  import { defineThreads } from "@artooi/agents-web-components/threads";
  defineChat();
  defineThreads();
</script>
```

- **Binding.** `for` names the chat's `id`, looked up in the list's own root, the document or the
  shadow root it sits in; a chat added later is picked up when it first reports its thread. Or set
  the `chat` property, which wins over `for` until it is set back to `null`. With neither, the
  list binds to the chat of an [`<ag-ui-agents>` provider](agents.md#several-agents-under-one-provider):
  the one its `agents` attribute names by id, else the nearest one around it, and lists again each
  time the provider moves its chat to another agent. `for` wins when both are present.
- **`variant`.** `list` (the default) draws rows and an empty text. `pills` draws a strip that
  stays on one line and scrolls sideways, and no empty text. Both give each conversation a delete
  behind an inline confirm, which calls `chat.deleteThread`; in a pill the confirm opens on the
  pill's own line.
- **Picking a row** fires **`ag-ui-threads-select`** (`THREADS_SELECT_EVENT`, detail
  `{ threadId }`, bubbling, composed and cancelable), then calls `chat.switchThread`, which
  **cancels a run in flight**, as the built-in list does. Call `preventDefault()` to route to the
  conversation yourself; otherwise it is the moment to close a popover the list sits in.
- **Run marks.** A row whose store reports [thread status](#thread-status) carries one mark:
  `waiting`, `failed`, `running` or `unread`, in that order of precedence, as `data-status` on
  the row and a dot with its word for a screen reader inside the row's button.
- **`refresh()`** reads the store again. The list does so after every thread, title and
  run-finished event, and takes the rows of every `ag-ui-threads-change`; call it when something else
  changed the store, such as another tab. **`threads`** *(read-only)* is the rows on screen, as the
  store last listed them. A redraw keeps keyboard focus on the row, delete or confirm it was on.
- **`strings`** translates every piece of text (`label`, `untitled`, `empty`, `delete`,
  `deleteConfirm`, `deleteYes`, `deleteNo`, and the marks' `running`, `waiting`, `failed`,
  `unread`), merged over the English, so `{ deleteNo: "Abbrechen" }`
  changes that one string.
- **Styling.** Parts `list`, `row` (plus `row-active` on the thread on screen), `row-button`,
  `mark` (plus `mark-running`, `mark-waiting`, `mark-failed` or `mark-unread`), `delete`,
  `confirm`, `empty`. The chat's colour tokens apply, plus `--ag-ui-danger` (the delete
  confirmation and the failed mark) and `--ag-ui-waiting` (the waiting mark). The list takes the
  light or dark half of each from the page's own `color-scheme`, since it sits in your chrome
  rather than in the chat's. The host carries `data-empty` when the chat has no conversations.

The main `/bundle` does not carry the element. Without a build step, load
`/threads/bundle` beside it:

```html
<script type="module">
  import { defineChat } from "./agents-web-components.bundle.js";
  import { defineThreads } from "./agents-web-components.threads.bundle.js";
  defineChat();
  defineThreads();
</script>
```

## Thread status

django-ag-ui 0.84.0, on a mount with a run store, lists each thread with its run's `status`
(`idle`, `running`, `waiting`, `failed`), its `last_read_at`, a `reason` when it failed and, when
it waits, AG-UI `interrupts`. `RemoteConversationStore` (what `data-threads-url` builds) reads
them onto `ThreadMeta` as `status`, `reason` and `interrupts`, and works out `unread`. An older
server, or a mount without a run store, lists none of them and nothing below happens.

- **Unread** is a thread that changed after it was last read, by the server's clock on both
  sides, and is not running now. A thread never read reads as not unread: the server keeps no
  mark until a thread is read once, so a first turn left before its answer came is counted in
  that page only, not after a reload.
- **Read.** When the element reads a thread (`markRead`), the store posts
  `POST <threads-url><id>/read/`, and only once a list carried `status`, since the route is
  mounted only beside a run store. The thread then reads as read here until it changes again.
- **Keeping it fresh is the host's choice, and opt-in.** `data-thread-status="poll"` asks the
  list again every five seconds with its ETag (a `304` costs nothing); `"stream"` follows the
  same URL as Server-Sent Events, read with `fetch` so the headers and cookie policy apply,
  reconnecting when the server ends it. A server that answers the stream request with JSON (a
  WSGI deployment) is polled instead. Without the attribute the list is read when it always was:
  when the drawer opens, a thread switches, or `<ag-ui-threads>` re-lists. Each list the watch
  receives is counted into the [unread badge](header-and-panel.md#the-unread-badge) and fired as
  **`ag-ui-threads-change`** (`THREADS_CHANGE_EVENT`, detail `{ threads }`), which
  `<ag-ui-threads>` draws. A store of your own takes part by implementing
  `watchThreads(listener, transport)`.
- **A waiting approval is answered where it waits.** Opening a thread whose run is parked on an
  approval (`metadata.kind == "approval"`) shows the approval card on its tool call, as a live
  run's interrupt does, and the answer starts the run again with `resume` built by
  `@ag-ui/client`'s `buildResumeArray`. Asked of the store when the thread is restored
  (`waitingInterrupts(threadId)`, which `data-threads-url` answers from the list with its ETag),
  so it needs no `data-thread-status`. Stop, or leaving the thread, while the person decides
  sends and writes nothing: the run stays parked and is offered again next time. A `question` or
  `external` interrupt, or a mix, is marked waiting and not offered: the server maps every resume
  entry to an approval, so answering one that way would approve it. A host driving its own `AgUiClient`
  answers a parked run the same way with `client.answerParked(interrupts)`, which asks its
  `resolveInterrupts` once and sends the resume.
