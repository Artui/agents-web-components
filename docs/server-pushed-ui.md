# What the server draws

## Charts

Markdown here goes through a narrow sanitiser and images are off by default — a
model-controlled image URL is fetched with no user interaction, which turns
prompt-injected page data into a zero-click exfiltration channel. So a chart
does not arrive as markup. It arrives as **data**, and the component builds the
SVG itself: the model chooses the numbers, the component chooses the DOM.

Off unless you ask for it, by either route or both:

```js
const chat = document.querySelector("ag-ui-chat");
chat.enableCharts(["tool", "activity"]);
```

Order does not matter. Calling it after the element is on the page redraws any
charts already in the restored history, so you do not have to reach the element
before it connects — which you generally cannot.

Specs are bounded, and anything outside is dropped rather than half-drawn: at
most **20,000 points** and **2,000 labels**, and every point a finite number no
larger than **1e15**. The first two keep a stored transcript from blocking the
main thread on every reload; the last one keeps the value range finite, since
scaling divides by it.

**`"tool"`** registers a `render_chart` tool the agent may call. The numbers are
in its context, so it can talk about them; it costs one model round.

**`"activity"`** draws a chart the server pushes as an `ACTIVITY_SNAPSHOT` with
`activityType: "chart"` (exported as `CHART_ACTIVITY_TYPE`). The data never
reaches the model, there is no extra round, and this is the only route that can
**update a chart in place** — the server repeats the same `messageId` to redraw
it, or sends an `ACTIVITY_DELTA` to move one series as a computation advances.

**Whether a pushed chart survives a reload depends on where the conversation is
stored.** A client-side store keeps activities, so it comes back. A server that
stores the thread as the model's message history does not — a pushed chart is
deliberately not in that history, which is the reason to push it. A chart the
agent asked for survives either way, because its spec travels as the tool call's
arguments and the component redraws from those without re-running anything.

A server that wants the pushed chart back opts in: django-ag-ui's
`AGUIServer(thread_activity_source=...)` (a `ThreadActivitySource`) materialises each activity
as an `activity` message in `GET <id>/`, and the component redraws it. The
[threads contract](threads-contract.md#restoring-a-pushed-chart) states the shape.

Either way the payload is the same shape:

```json
{
  "kind": "bar",
  "title": "Signups this week",
  "labels": ["Mon", "Tue", "Wed"],
  "series": [{ "label": "new", "points": [12, 19, 9] }]
}
```

`kind` is one of `bar`, `line`, `pie`, `scatter`, `stacked`; anything else is
drawn as a bar rather than refused. Every series needs exactly one point per
label — a shorter one misaligns every value after the gap, and a chart that is
subtly wrong still reads as authoritative, so the whole spec is dropped instead.
A pie's slices are its labels, so it draws the first series only.

Theme the series with `--ag-ui-chart-1` … `--ag-ui-chart-6`, size it with
`--ag-ui-chart-max-width`, and style the block through the `chart-block`,
`chart-title` and `chart-legend` parts.

**A chart stops at its own width, and is sized in pixels rather than scaled to
them.** Two separate things, and a widened panel needs both.

It is drawn for the width the block actually has -- one SVG unit per CSS pixel
-- and redrawn when that width changes, so a 10px axis label is 10px in a 380px
panel and in a 1200px one. Where the labels no longer fit, the axis draws every
second or third rather than a smear of overlapping words. Below 220px it goes
back to scaling, since at that size nothing fits either way.

And it takes the width it needs rather than the width it is offered, capping at
`--ag-ui-chart-max-width` (**480px**): widening the panel should no more resize
a chart than it resizes a message. Raise the token for a bigger chart and the
labels stay 10px -- the cap is about how much room the drawing gets, never
about how big its type is. Height follows width inside a 160-320px band.

### Drawing something other than a chart

`render_chart` is built on a seam any tool can use. A `ClientTool` may declare a
pure `render` beside its `handler`:

```js
chat.registerTool({
  name: "show_route",
  description: "Draw the route on a map.",
  parameters: { type: "object", properties: { stops: { type: "array" } } },
  handler: () => "route shown",
  render: (args) => buildMapElement(args.stops),   // pure; no side effects
});
```

**`render` is the only half a restored transcript replays.** Replaying a tool's
*effect* is out of the question — re-running a form-filling tool on every reload
is a bug. The replay path is handed the `render` function alone, never the tool
that owns it, so the code that runs on restore cannot reach `handler` even by
mistake: adding a "no render? fall back to the handler" convenience there means
changing a type signature first, which is the moment the question gets asked.

That is why `render` has to be a pure, deterministic function of its arguments —
it runs again every time the conversation is restored.

## Drawing other things the server pushes

`activityType` is an open string the protocol does not enumerate — `"chart"` is
just the one the component ships a renderer for. Register your own and the
server can push anything it likes into the transcript:

```js
chat.registerActivityRenderer({
  type: "build_status",
  render: (content) => {
    const el = document.createElement("div");
    el.className = "build";
    el.textContent = `Build ${content.status}`;
    return el;   // null: could not be drawn; an empty fragment: nothing to draw
  },
});
```

**`render` runs again on every thread load**, so it carries the same contract as
a client tool's `render`: a pure function of `content` and the context it is
drawn in (below), deterministic, and free of effects outside the node it returns. Activities are materialised into
`role: "activity"` messages and persisted with the transcript, so a renderer that
writes to the page instead of returning DOM fires again on every restore.

The component places what you return, keyed by the activity's `messageId`, so a
server repeating an id **replaces** your node rather than adding a second one —
the same in-place update charts get, unless `render` hands back the node it was
given (below). Returning `null` removes whatever was there, with a console
warning: live and reload should agree, and the stored content is the version
that could not be drawn.

Content that is fine and has nothing to show — a record meant for the model, a
list with nothing in it for the user — returns an **empty `DocumentFragment`**
instead: nothing is drawn, nothing is logged, the type is not reported as
unhandled, and anything drawn under that `messageId` before is taken away. A
renderer that always returns one is how a type is known and deliberately drawn
as nothing.

`chart`, `compaction`, `suggestions` and the types below are registrations
exactly like yours, not privileged branches, so registering any of those names
**replaces the built-in**, before or after the element connects.

### Built in: what pydantic-ai's AG-UI adapter sends

pydantic-ai's own AG-UI adapter sends activities of its own, and each has a
built-in renderer, so none of them shows in `unhandledActivityTypes`.

| `activityType` | Drawn as |
| --- | --- |
| `pydantic_ai_enqueued_messages` | Each user message's text as a user bubble (`message-user`), as text and never as HTML, in an `enqueued-messages` column with an `enqueued-messages-note` caption (string `enqueuedMessages`). Messages the run took in while it was working, through `RunContext.enqueue`. Other roles draw nothing. |
| `mcp-apps` | A run notice (`run-notice-mcp-app`) that the app view cannot be shown here, naming its `resourceUri` (string `mcpAppUnsupported`, token `{uri}`). |
| `pydantic_ai_compaction`, `pydantic_ai_tool_availability_delta`, `pydantic_ai_model_settings_delta`, `pydantic_ai_capability_load_delta` | Nothing: records the adapter keeps for the model. |

`compaction`, django-ag-ui's own notice, is separate and stays drawn. The
adapter's enqueued messages are drawn only: `@ag-ui/client` does not send
activities back to the server, so a later run does not see them as turns.

### Updating a surface in place, and drawing it inert on replay

`render` takes a second argument, an `ActivityRenderContext`:
`{ messageId, previous, live }`. A one-argument renderer ignores it and keeps
working as before.

- **`previous`** is the node your renderer returned for this `messageId` last
  (`null` on the first draw). Update it and **return it**, and the component
  leaves it where it is instead of replacing it, so a field the user is typing
  into keeps its value and its focus when the server redraws the activity.
  Returning a new node replaces the old one, as before.
- **`live`** is `true` when the draw comes from the run in flight and `false`
  when a stored conversation is put back (a reload, a thread picked from the
  drawer, a Retry redrawing what came before it). **A surface drawn with
  `live: false` must be inert**: no button that acts, every input disabled. A
  restored surface is redrawn on every thread load, and acting on it would
  send an action from a turn the conversation has moved past.

```js
chat.registerActivityRenderer({
  type: "approval_form",
  render: (content, { previous, live }) => {
    const form = previous ?? document.createElement("form");
    if (previous === null) {
      form.append(document.createElement("input"), document.createElement("button"));
      form.querySelector("button").textContent = "Approve";
      form.onsubmit = (event) => {
        event.preventDefault();
        void chat.run({ forwardedProps: { action: "approve", note: form.elements[0].value } });
      };
    }
    for (const control of form.elements) control.disabled = !live;
    return form;
  },
});
```

### Which carrier should the server use?

AG-UI leaves exactly two payload names open, and they are not
interchangeable:

| | Carrier | Reaches | Persisted | Replayed |
| --- | --- | --- | --- | --- |
| **Content** | `ACTIVITY_SNAPSHOT` | the transcript | yes | yes |
| **Imperative** | `CUSTOM` | your page, as [`ag-ui-custom`](host-seams.md#host-seams-the-spa-story) | no | no |

⇒ **Content has a place in the conversation and should come back. An imperative
has no place and no meaning once acted on** — replaying "refetch the board" on
every thread load is a bug, not a feature. If it has to survive a reload, it is
content.

### Finding out what arrived

An activity nobody registered for draws nothing and logs nothing — that is the
protocol's own answer, and warning would fire on every forward-compatible
server. But silence is hard to debug, so the names are readable:

```js
chat.unhandledActivityTypes; // ["build_status", …]
```

Note `"chart"` appears there until you call `enableCharts(["activity"])`, which
is the honest answer to "I pushed a chart and nothing happened".

## A2UI surfaces

An agent can describe a small interface as A2UI 1.0 components: a form, a
choice, a card with a button. The `./a2ui` entry draws it from the data the
server pushes, never from markup, and sends what the user does back as a run.

```js
import { registerA2ui } from "@artooi/agents-web-components/a2ui";

const chat = document.querySelector("ag-ui-chat");
registerA2ui(chat, {
  onError: (message) => console.warn(message), // the default
});
```

`registerA2ui` does three things:

- registers the `a2ui-surface` activity renderer, the activity type
  `@ag-ui/a2ui-middleware` and django-ag-ui's `render_a2ui` tool send;
- posts this renderer's catalog as a context entry on every run, under the
  description the server looks it up by, so the server offers the agent a
  `render_a2ui` tool for exactly these components. The catalog is
  `a2ui/v1/catalog.json` in this package, and its id is that file's URL;
- starts a run for each action a surface sends, with the action in
  `forwardedProps.a2uiAction` and the user turn django-ag-ui stores for it, so
  the bubble drawn now is the one a reload shows.

It returns the function that stops posting the catalog.

The catalog is the A2UI basic catalog's twelve components (Text, Image, Icon,
Row, Column, List, Card, Divider, Button, TextField, CheckBox, ChoicePicker)
and fourteen functions (required, regex, length, numeric, email, formatString,
formatNumber, formatCurrency, formatDate, pluralize, openUrl, and, or, not).

An Image loads only an `http:` or `https:` URL, an image `data:` URL, or a
relative path on the page's own host; `openUrl` takes the same, minus `data:`.
Anything else the agent names draws no image and opens nothing.

A surface restored from a stored conversation is drawn inert: its buttons do
nothing and its inputs are disabled, because acting on it would send an action
from a turn long past.

**Errors go to the host.** A2UI's `error` message (`VALIDATION_FAILED`,
`EXPRESSION_ERROR`, `EXECUTION_ERROR`, `INTEGRITY_ERROR`) is meant for the
agent, but neither `@ag-ui/a2ui-middleware` nor django-ag-ui carries one back
yet. So a live surface hands each error, as the spec's
`{version: "1.0", error: {code, surfaceId, message, path?}}`, to `onError`
(by default `console.warn`) once per draw of the surface; a redraw with new
content reports again. It draws a notice where it could not draw, and starts
no run. A component or a catalog this renderer does not hold is drawn as an
`a2ui-notice`.

### Vendoring it

`./a2ui/bundle` (`dist/agents-web-components.a2ui.bundle.js`) is the same entry
as one file with everything inlined, to load beside the main bundle. It reaches
the element only through the `chat` it is handed, so it carries none of it. It
does carry its own copy of `marked` and DOMPurify, since Text draws markdown
through the same sanitiser as the transcript.

### Styling a surface

Each surface is an `a2ui-surface` part; every component on it carries
`part="a2ui-<kebab-case type>"` and `data-a2ui-id`, its id on the surface. The
parts are `a2ui-text`, `a2ui-image`, `a2ui-icon`, `a2ui-row`, `a2ui-column`,
`a2ui-list`, `a2ui-card`, `a2ui-divider`, `a2ui-button`, `a2ui-text-field`,
`a2ui-check-box` and `a2ui-choice-picker`. A variant shows on the component as a
`data-` attribute: `data-variant` on Text and Image, `data-fit` on Image,
`data-justify` and `data-align` on Row and Column, `data-align` and
`data-direction` on List, `data-axis` on Divider, and `data-unknown` on an Icon
whose name has no glyph. A slot whose child has not arrived yet
holds a hidden `a2ui-placeholder`. An `@accessibility` label or description
lands on the component's native control where it has one (the `<button>`, the
`<input>`), and on the component otherwise. Inside the inputs:

- Button: `a2ui-button-control`, `a2ui-button-message`;
- TextField: `a2ui-text-field-label`, `a2ui-text-field-input`,
  `a2ui-text-field-message`;
- CheckBox: `a2ui-check-box-label`, `a2ui-check-box-input`,
  `a2ui-check-box-text`, `a2ui-check-box-message`;
- ChoicePicker: `a2ui-choice-picker-label`, `a2ui-choice-picker-filter`,
  `a2ui-choice-picker-options`, `a2ui-choice-picker-option`,
  `a2ui-choice-picker-input`, `a2ui-choice-picker-option-text`,
  `a2ui-choice-picker-message`.

The surfaces read the element's theme tokens, so a theme set on `<ag-ui-chat>`
reaches them.

## MCP Apps views

A tool on an MCP server can come with a view: an HTML resource the
[MCP Apps](https://github.com/modelcontextprotocol/ext-apps) extension draws
beside its result. The agent pushes an `mcp-apps` activity naming the view and
its server; the `./mcp-apps` entry frames the view and speaks the host's end of
its bridge. Without it the element draws a notice that the view cannot be shown.

```js
import { registerMcpApps } from "@artooi/agents-web-components/mcp-apps";

const chat = document.querySelector("ag-ui-chat");
registerMcpApps(chat, {
  url: "/agent/mcp-apps/", // the host's route
  sandboxProxyUrl: "https://sandbox.example.com/proxy.html", // optional, another origin
});
```

The route takes a JSON `POST` of `{ serverId, method, params }`, sent through
`chat.request` so it carries the element's headers and credentials, and answers
as django-ag-ui's does: `200` with `{ "result": ... }`, the MCP result object
(a tool result with `isError` is still a `result`), or `{ "error": { "code",
"message" } }` with a JSON-RPC code for a call it cannot relay, which a view's
`tools/call` is answered with as it is. Any other status or body fails the call
with `-32000`. `method` is `resources/read` (the view's HTML, read once per
server and URI for the page) or `tools/call` (a tool the view calls). A toolset
with no `id` sends no `serverId`, and its views draw the notice.

The view is framed once it first scrolls into sight: in a `srcdoc` frame with
`sandbox="allow-scripts"` and the view's CSP as the first `<meta>` of its head,
or, with `sandboxProxyUrl`, in the proxy on its own origin. When the view leaves
the document, in sight or not (a thread switch, a cleared conversation, or the
chat itself removed), its frame and bridge go, and it is framed again if it
returns. A `srcdoc` frame
inherits the host page's CSP, so a host with a strict `script-src` sets a proxy.

The package ships a proxy page, `@artooi/agents-web-components/mcp-apps/sandbox-proxy.html`
(`dist/sandbox-proxy.html`): one static file with its script inline. Serve it as is on a
second origin, one the page's own origin is not, and name its URL as `sandboxProxyUrl`. It
puts the view in an inner `sandbox="allow-scripts"` frame with the view's CSP as the first
`<meta>` of its head, so serve it with no CSP header of its own (an inner `srcdoc` frame
inherits one) and let the host page's `frame-src` reach that origin.

```sh
# The static site served at https://sandbox.example.com, not the chat's origin.
cp node_modules/@artooi/agents-web-components/dist/sandbox-proxy.html sandbox-site/proxy.html
```

```js
registerMcpApps(chat, {
  url: "/agent/mcp-apps/",
  sandboxProxyUrl: "https://sandbox.example.com/proxy.html",
});
```

**The bridge** is JSON-RPC over `postMessage` (MCP Apps 2026-01-26), read only
from the view's own frame:

| The view sends | The host |
| --- | --- |
| `ui/initialize` | answers with `hostContext`: `theme`, `styles.variables`, `locale`, `displayMode` (`inline` until it asks), `availableDisplayModes` (`["inline", "fullscreen"]` for a live view, `["inline"]` for a stored one), `containerDimensions` (inline, the frame's width and a `maxHeight` of 640; fullscreen, its `width` and `height`) and `platform: "web"` |
| `ui/notifications/initialized` | sends `ui/notifications/tool-input` (the call's arguments), then `ui/notifications/tool-result` |
| `ui/notifications/size-changed` | sets the frame's height, at most 640px; the view scrolls past it |
| `tools/call` | once the user allows it (below), sends it to the route with the view's `serverId` and answers its `result`, or its `error` with the route's code; declined, `-32000` "Tool call denied" |
| `ui/message` | once the user allows it (below), sends its text as the user's next message (`chat.sendMessage`); `isError` when nothing was sent; declined, `-32000` "Message sending denied" |
| `ui/open-link` | opens an `http(s)` URL in a `noopener` tab; `isError` for any other |
| `ui/request-display-mode` | `fullscreen` fixes the view over the page in the same frame, which does not reload, with an exit control (string `mcpAppExitFullscreen`); Escape, that control or `inline` returns it to the transcript at its height. Answers the mode it is in after: the current one for `pip`, and for a stored or torn-down view |
| `ui/notifications/request-teardown` | sends `ui/resource-teardown`, then closes the view to the notice |
| anything else | answers `-32601` |

`tools/call`, `ui/message` and `ui/open-link` are refused while the view is
drawn from a stored conversation rather than a live run, and once it has asked
to be torn down. Once initialised, the
view is sent `ui/notifications/host-context-changed` with what changed when the
`theme` attribute, the system scheme, the frame's width or its display mode does
(`displayMode` and `containerDimensions`, however it was switched). Fullscreen
shows the view's box as a manual popover, in the top layer, so it covers the
viewport above the host page's own layers whatever `--ag-ui-z-index` is and in
every placement; a browser without popover (Firefox before 125) draws it as a
fixed box inside the host's stacking context instead. One
view per registration is fullscreen at a time; a second's request returns the
first inline.

**A view never acts unseen.** A view's script runs as soon as it is framed and
can post at any moment, and the host cannot tell a click inside a cross-origin
sandboxed frame from a script: user activation there is not visible to the page.
So every `tools/call` and `ui/message` of a live view waits for the user in a
confirmation card under the view's frame (pinned under it while fullscreen),
which names the tool and its arguments, or shows the exact text to be sent.
Confirm runs it; Cancel answers the view `-32000`. The card takes the
confirmation card's styles and the `confirm` part (plus `mcp-app-consent`), its
prompts are the strings `mcpAppConfirmTool` and `mcpAppConfirmMessage`, and it
takes no focus, so a key meant for the composer cannot answer it. A view's
requests are asked one card at a time, in order; a card still waiting when the
view asks to be torn down, or leaves, is declined, and a request allowed after
the view went stored or asked to be torn down is refused. There is no setting
to turn it off. The MCP Apps specification allows exactly this: a host "MAY
request user consent" for `ui/message`, and may subject other requests "to
further user approval".

A view that navigates its own frame is closed to the notice: a `srcdoc` frame
seen by the host, a proxied one reported by the shipped proxy page with
`ui/notifications/sandbox-view-navigated`.

`styles.variables` are the element's own tokens, resolved in the scheme drawn
now, under the MCP Apps names: `--color-background-primary` (`--ag-ui-bg`),
`--color-text-primary` (`--ag-ui-fg`), `--color-border-primary`
(`--ag-ui-border`), `--font-sans` (`--ag-ui-font`), `--border-radius-md`
(`--ag-ui-radius`) and the shades between them, so a view themed from them
follows the chat's theme.
