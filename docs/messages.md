# Messages

## Markdown rendering

Assistant bubbles render sanitized markdown/HTML via [`marked`](https://www.npmjs.com/package/marked)
(GitHub-flavoured, single-newline line breaks) piped through
[DOMPurify](https://www.npmjs.com/package/dompurify). User messages stay literal text. The
allowlist permits emphasis, code, lists, quotes, headings, links, tables, and — when `allowImages`
is set — images; links are hardened with `target="_blank" rel="noopener noreferrer"`;
`iframe`/`style`/scripting are excluded, as are every `data-*` and `aria-*` attribute and every
`class` but a code fence's `language-*` hint, so model output cannot dress itself up as the
component's own approval or tool-call chrome. The exported helper `renderMarkdown(text)` does this
standalone. `marked` and `dompurify`
are runtime dependencies.

An animated 3-dot "thinking" indicator (`role="status"`, with an aria-label) appears before the
first token and between tool rounds, honouring `prefers-reduced-motion`. It has no public API.

### Incoming-text animations

The `data-text-animation` attribute controls how a fully-received assistant message reveals:
`none` (default) / `fade` (a CSS fade) / `word` (JS word-by-word via the internal `wrapWords`
reveal). It honours `prefers-reduced-motion` (collapsing to instant).

```html
<ag-ui-chat endpoint="/agent/" data-text-animation="word"></ag-ui-chat>
```

## Follow-up suggestions

The agent can offer the *next* question, not just answer this one. Registered
skill chips are static and host-configured, so they can say "summarize this" but
never "want me to update the shipping address too?" after a tool has run.

The server pushes an `ACTIVITY_SNAPSHOT` under the `suggestions` type — with
django-ag-ui, `suggestions_activity([...])`. The component draws each prompt as
a chip; clicking one sends it as the user's message, exactly as if they had
typed it.

```json
{ "activityType": "suggestions",
  "content": { "prompts": ["Update the shipping address too"] } }
```

**Chips are content.** They ride the same activity envelope as charts, so they
persist and a reload puts them back, and a set pushed under an id already on
screen replaces that row rather than adding a second one.

At most **4** prompts of **120** characters each — `MAX_SUGGESTIONS` and
`MAX_SUGGESTION_CHARS`, both exported. The server-side helper *raises* past
those bounds while this side silently drops: that asymmetry is deliberate, since
the producer can report the problem and the client cannot.

Nothing to enable. A `suggestions` activity from a server that pushes one is
drawn; an `activity_type` this component does not know is ignored, which is what
the open field is for.

## Localizing the timestamps

There is **no `Intl` anywhere in this component**. The relative timestamps in the
thread drawer and checkpoint panel (`"5m ago"`, `"2d ago"`) are deliberately
locale-neutral: a component that guessed a locale would disagree with the page
it is embedded in, and being wrong in a second language is worse than being
neutral in one.

That is a good default and a bad requirement, so it is replaceable:

```js
const rtf = new Intl.RelativeTimeFormat("de", { numeric: "auto" });
chat.formatRelativeTime = (ts) =>
  rtf.format(Math.round((ts - Date.now()) / 60000), "minute");
```

`relativeTime` is exported too, for a host that wants to build on the built-in
rather than replace it.

## Message actions: copy, retry, feedback

Every finished assistant message carries a small row of actions beneath it —
a **sibling** of the bubble, never a child, so the buttons never join the
message's own text.

- **Retry** re-asks the question. History is truncated to the most recent user
  message inclusive and the run repeats, so the agent answers what it was asked
  rather than being told its last answer was wrong. After `chat.run`, Retry
  answers for the action instead: it asks for a refused one again, unchanged, and
  is not offered once the action's run started (see *Starting a run with
  forwarded props*).
- **Copy** puts the message's text on the clipboard, and says so on the button.
  A refused clipboard permission is reported there too, rather than thrown.
- **Thumbs up / down** fire `ag-ui-feedback` (wired below) and **store nothing**.
  **Off unless you ask for them** — `data-message-actions="copy,retry,feedback"`.
  Without a listener the buttons still latch, so a reader is told a rating was
  taken while nothing recorded it.

Retry sits on the **last** answer only. Re-running an older turn is branching,
and for a page-driving agent editing a past turn is not neutral — those turns
clicked buttons, and re-running turn 3 does not un-save what turn 5 saved.

!!! note

    A retried turn **re-runs its tools.** The previous attempt already did what it
    did, and this does not undo it. Confirmation still applies, so a destructive
    tool asks again — unless the user waived it for this session with
    *Always allow*.

A failed run gets the same row, with Retry and Copy and no rating: error text is
what people paste into a bug report, but "the connection dropped" is not a
statement about answer quality and mixing it into feedback makes that signal say
less. This is why a dropped connection is still rendered as an **error** rather
than demoted to a run notice — a notice "never settles, takes no action, and
carries no controls", and a failure with a way back needs one.

The row can be trimmed, or removed, with `data-message-actions` — a comma list of
the actions to keep, or `="false"` for none at all:

```html
<!-- copy only: nothing here listens for a rating, and the surface forbids re-runs -->
<ag-ui-chat endpoint="/agent/" data-message-actions="copy"></ag-ui-chat>
```

The default is `copy,retry`. Those two work with nothing wired; the rating pair
needs a listener, so it is asked for rather than assumed.

### What Copy puts on the clipboard

Both flavours of the message: `text/plain` for anywhere, and `text/html` for a
target that understands it. A table therefore pastes into a spreadsheet as
columns and into a document as a table.

The plain flavour is serialised structurally rather than read off `textContent`,
which is the obvious source and loses everything: it concatenates descendants
with no separator, so a table arrives as one unbroken run of cells with the
headers welded to the first row. Rows are tab separated because that is what a
spreadsheet splits on; list items keep their bullets and numbers; a code block
keeps its own whitespace.

Both flavours are taken from a copy of the message with the component's own
buttons removed. The code blocks' copy buttons live *inside* their `pre`, so
they are descendants of the message: before this, copying an answer containing a
code block copied the word Copy along with it.

A host that drives its own bar gets the same by passing `html` alongside `text`
to `attachMessageActions`; with `text` alone the clipboard gets plain text only,
exactly as before.

### Sizing and theming the row

The controls are icon-only, so the whole box is the target. It is sized from
`--ag-ui-action-size`, with a floor rather than a fixed height so the compact
density cannot shrink it below the 24px that keeps it reliably tappable.

Each control draws its own label on hover **and on keyboard focus**. That is not
the `title` attribute repeated: a `title` never appears on focus, so an
icon-only button is unnamed for anyone tabbing to it. On a touch device, where
there is no hover to reveal it and it would sit over the answer, it is not
drawn at all.

```css
ag-ui-chat {
  --ag-ui-action-size: 28px;        /* the control box; floors at 24px */
  --ag-ui-action-icon-size: 15px;   /* the mark inside it */
  --ag-ui-tooltip-bg: #1f2430;
  --ag-ui-tooltip-fg: #f5f6fa;
}
```

To swap a mark for your own, style its part — `message-action-icon-copy` and its
siblings. A slot would be the better channel and cannot be used: these repeat
once per message, and a named slot can only be filled once.

It is per-action rather than one switch because the three disappear for
different reasons. Thumbs are only useful to a host listening for
`ag-ui-feedback`, and two buttons that lead nowhere are worse than none. Retry
re-runs the agent, which a constrained surface may not permit. Copy is the one
nobody objects to — and with a single switch, dropping either of the others would
have cost it too. Nothing survives, and no row is built at all: an empty row
still takes its margin and still announces itself as a group of actions.

`retryLastTurn()` is public, for a host driving its own message UI.

```js
await chat.retryLastTurn(); // false when there is nothing to ask again, a run is in flight, or a restore is loading
```

### Storing a rating

`ag-ui-feedback` names the message that was rated, so a host can file the
rating against it rather than against its text — two answers can read the same,
and nothing about the text survives a reload:

| Field | Type | What it is |
| --- | --- | --- |
| `messageId` | `string` | The AG-UI id of the rated assistant message: the id it streamed under (`TEXT_MESSAGE_START` / `TEXT_MESSAGE_END`), or the stored message's `id` when it was restored from history. A restored answer whose store returned no id offers no rating pair, since a rating has to name a message. |
| `threadId` | `string` | The conversation it belongs to: the element's thread when the message was drawn. |
| `runId` | `string`, optional | The run that streamed it, as that run's `RUN_STARTED` named it. Text a sub-agent streams through the parent run carries the parent's `runId`. **Absent on a restored message** — an AG-UI message carries no run id, so there is none to give and the key is left out rather than guessed. |
| `content` | `string` | The message's text, as rendered. |
| `rating` | `"up"` \| `"down"` | Which button. |

```js
chat.setAttribute("data-message-actions", "copy,retry,feedback");
chat.addEventListener("ag-ui-feedback", (e) => {
  const { messageId, threadId, runId, rating } = e.detail;
  // Keyed by message: rating the same answer again replaces the earlier rating.
  fetch(`/api/threads/${threadId}/ratings/${messageId}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating, ...(runId === undefined ? {} : { runId }) }),
  });
});
```

!!! note

    **A restored message is named by whatever `id` the conversation store returns
    for it.** The built-in browser store saves the conversation as it streamed, so
    there a message keeps its id across a reload. With `data-threads-url` or a
    `conversationStore` of your own, the conversation comes back from your server,
    and a message keeps its id only if the server persists the ids it streamed:
    one that stores the conversation under fresh ids makes a rating made live and a
    rating made after a reload name the same answer by two different ids. Live,
    the id is always the one on the wire.

## Sources an answer cites

When the model says which sources back its answer (pydantic-ai's
`TextPart.citations`, carried by django-ag-ui 0.90.0 and later), the answer gets a
collapsed **Sources (n)** list under its text, above the action row. Nothing to
opt in to: an answer with no citations looks as before.

The list reads the assistant message's `metadata.citations`: live from the
`TEXT_MESSAGE_END` that closes it (which `@ag-ui/client` 1.0 also folds onto the
message it saves), and after a reload from the stored message the thread
endpoint returns. Each entry is pydantic-ai's `Citation` in its JSON form:

| Key | Drawn as |
| --- | --- |
| `sources` | One line per source. A `web` source is a link to its `url` (only `http` and `https` become links; anything else is shown as text), named by its `title` or else the URL. A `document` source is its `title`, else its `document_id`, else the string `citationDocument`. Each of `excerpts` is quoted under it. |
| `anchor` | `{kind: "content", start, end}`: the cited range of the answer, quoted. `{kind: "marker", ...}`: the model's own marker such as `[1]`, shown as code. `null`: sources only. |

`start` and `end` count UTF-16 code units into the message's own `content`, so
`content.slice(start, end)` is the range. The range is quoted rather than
highlighted in the bubble, because the offsets index the markdown source and the
rendered text is shifted by its syntax. An anchor that does not fit the text is
dropped and its sources kept; a citation with no usable source is dropped.
Titles, URLs and excerpts go in as text, never as HTML.

**Live and reloaded copies can differ.** Text on both sides of a file part streams
as two messages, each with its own citations, and is stored as one message
joined by a newline under a fresh id, its citations indexing the joined text. So
the answer draws as two bubbles live and one after a reload, each list read
against its own text. A rating given live names the streamed ids; after a
reload, the stored one. A split around reasoning is stored
under the ids it streamed, so it draws and rates the same either way.

Copy and a rating's `content` leave the list out. Style it through the
`citations` part, or the strings `citations` (token `{count}`) and
`citationDocument`.

## Quoting a selection

Select any text in the transcript and a small **Quote** offer floats beside it.
Taking it drops the selection into the composer as a markdown blockquote and
leaves the caret on a fresh line under it — a quotation is how a question
narrows to one part of an answer, so nothing is sent until you say what you are
asking.

Quoting **appends**, after whatever is already typed, so a second quotation is a
second thing being asked about rather than a replacement for the first. Long
selections are capped at 500 characters: select-all-then-quote is a gesture the
transcript already answers, and pasting the whole conversation back costs tokens
to say nothing.

Set `data-quote-selection="false"` to turn the offer off. The `quote-selection`
`part` styles it.

### The half that matters: selection in **your** page

The transcript is the easy half. A chat mounted beside a table, a diff or a
report is sitting in the surface the user actually works in — and *that*
selection is one no hosted chat can reach.

`offerQuoteInPage()` extends the same select-then-offer gesture to the whole
page. It is opt-in, because it listens on your document:

```js
const stop = chat.offerQuoteInPage();       // the whole page
chat.offerQuoteInPage(document.querySelector("#report")); // or one region
```

For a deliberate trigger instead of a selection, `quote(text)` is the seam
underneath:

```js
// "Ask about this row" — a button on each row of your own table.
row.querySelector(".ask").addEventListener("click", () => {
  chat.quote(row.innerText);
});
```

`quote()` never sends — pair it with [`sendMessage()`](quickstart.md#sending-from-your-own-ui)
if you want a one-click "explain this" that skips the composer entirely.

> **Do not write the four-line version of `offerQuoteInPage()`.**
> A `mouseup` listener that quotes every settled selection appends to the
> composer on every drag the user made to *read*, to copy, or to fix a typo —
> and it cannot tell a selection in your prose from one inside the user's own
> half-typed `<input>`, because Chrome reports a field's internal selection
> through `document.getSelection()` as an ordinary range over the field's
> **wrapper**. The text reads back perfectly and nothing about the range says
> where it came from; the only signal is `document.activeElement`. That guard,
> plus skipping the widget's own transcript, plus retiring a fixed-position
> affordance on scroll, is what the method is for.

> **Reading a selection out of a shadow tree takes care too.**
> Engines disagree about what `document.getSelection()` reports for a selection
> made *inside* a shadow root: WebKit rescopes the endpoints to the host element,
> so you get the whole widget and none of the words, while Chromium hands back
> the shadow nodes directly. `getComposedRanges` settles it, and this component
> uses it where it exists. `quotableSelection(container, roots)` is exported if
> you have the same problem in your own component.
