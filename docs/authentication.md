# Authenticating requests

The element talks to more than one endpoint. Beyond the AG-UI run itself, it may fetch the thread
index and a thread's messages, the tool-label and skill catalogs, the run index, and it may POST an
upload or a voice clip. **Every one of them is authenticated the same way**, by the element rather
than by the agent — so configuring authentication on a custom `agentFactory` authenticates the run
and nothing else, and the history drawer comes back empty because its request was anonymous.

| Request | Endpoint | Transport |
| --- | --- | --- |
| The agent run | `endpoint` | `fetch` (SSE), via `agentFactory` |
| Thread index / a thread's messages / rename / delete | `data-threads-url` | `fetch` |
| Tool-label catalog | `data-tools-url` | `fetch` |
| Skill catalog | `data-skills-url` | `fetch` |
| Run index | `data-runs-url` | `fetch` |
| Voice transcription | `data-transcribe-url` | `fetch` |
| File upload | `data-attachments-url` | `XMLHttpRequest` (for progress events) |

## `headers` and `getHeaders`

`headers` is a plain record sent with every request above:

```js
chat.headers = { "X-CSRFToken": getCsrfToken() };
```

It is read at request time, but only an assignment changes it — so a token captured there is pinned
until you remember to assign again. For anything that rotates (a short-lived JWT, a re-issued CSRF
token) set **`getHeaders`** instead, a function consulted immediately before every request:

```js
chat.getHeaders = () => ({ Authorization: `Bearer ${auth.accessToken()}` });
```

Because it is called per request, a token refreshed between two requests reaches the second one —
including mid-conversation, on the cached agent's own stream.

The two **compose**: they are merged per key, `getHeaders` winning, so a fixed header and a rotating
one can be configured independently and neither silently drops the other.

```js
chat.headers = { "X-Client": "admin" };
chat.getHeaders = () => ({ Authorization: `Bearer ${auth.accessToken()}` });
// every request: X-Client: admin + a freshly-read Authorization
```

## Cross-origin cookies (`credentials`)

If your API is on a different origin from the page — `app.example.com` calling `api.example.com`
counts, subdomains are cross-origin — the browser's default of `same-origin` sends **no cookies at
all**. The requests still go out; they arrive unauthenticated, and the server answers `401` while
looking perfectly configured. Set the cookie policy explicitly:

```html
<ag-ui-chat endpoint="https://api.example.com/agent/" credentials="include"></ag-ui-chat>
```

```js
chat.credentials = "include"; // mirrors the attribute
```

It takes `fetch`'s own three modes — `omit`, `same-origin`, `include` — applies to every request in
the table above, and is read per request, so a late assignment applies to everything after it.
Anything else is rejected where you wrote it: an unknown value assigned as a property throws, and an
unknown value in the attribute is reported to the console and ignored, rather than becoming a `401`
later on.

The server has to agree: `Access-Control-Allow-Credentials: true` and a concrete
`Access-Control-Allow-Origin` (the wildcard is invalid with credentials).

One asymmetry: uploads use `XMLHttpRequest` for real progress events, and its cookie switch is
two-state. `include` turns it on; every other value leaves it off. `omit` therefore cannot suppress
cookies on a *same-origin* upload — supply your own `uploadHandler` if that matters.

## Where those credentials are allowed to go

Every URL in the table above is a plain HTML attribute, and `headers` / `getHeaders` are attached to
whatever they name. That is what makes a cross-origin agent work — and it is also why a page must
never build one of those attributes out of a URL parameter, a CMS field, or anything else it did not
choose itself. Whoever supplies the value chooses where the token goes: the browser preflights the
custom header, any server willing to answer receives it, and it leaves on the element's first
request, before the user has typed anything.

Treat all seven as trusted configuration. When any of them resolves to another origin, the element
says so on the console once per origin, naming the destination and the header names it is about to
send. That covers all seven, not the agent endpoint alone: the tool catalog, the skills list, the
thread index, the attachment upload and the transcription endpoint carry the same headers, and
reporting only the agent would report the least interesting of them.

To confirm destinations you chose on purpose and silence the notice, name their origins:

```js
chat.trustedOrigins = ["https://api.example.com"];
```

That covers every endpoint the element requests itself, and is forwarded to `createHttpAgent`, so a
host that does not override `agentFactory` needs nothing else. A custom factory can also be given
the option directly:

```js
chat.agentFactory = (options) =>
  createHttpAgent({ ...options, trustedOrigins: ["https://api.example.com"] });
```

Origins are compared as `URL.origin` produces them — scheme, host and port. A notice is a notice,
not a refusal: nothing is blocked, because a cross-origin agent is a supported deployment and
refusing would break working installations to defend against a page that is already interpolating
untrusted data into its own markup.

## Framework hosts: configure before you insert

`headers`, `getHeaders` and `credentials` are read when a request is made, so they can be set at any
time. Several other things are read once, while the element **connects**: `strings`, `uploadHandler`
and `transcribeHandler` (they decide whether the attach and voice affordances exist at all) and
every chrome-building `data-*` attribute — and the catalogs and thread history are requested at, or
just after, that same moment.

React attaches `ref`s *after* it inserts the node, which puts the canonical integration on the wrong
side of that boundary. Create the element, configure it, then append:

```jsx
function Assistant() {
  const host = useRef(null);

  useEffect(() => {
    defineChat();
    const chat = document.createElement("ag-ui-chat");

    // Configure first - every one of these is read as the element connects.
    chat.setAttribute("endpoint", "/agent/");
    chat.setAttribute("data-threads-url", "/agent/threads/");
    chat.credentials = "include";
    chat.getHeaders = () => ({ Authorization: `Bearer ${auth.accessToken()}` });
    chat.registerTool(myTool);

    // ...then insert it.
    host.current.appendChild(chat);
    return () => chat.remove();
  }, []);

  return <div ref={host} />;
}
```

Writing it as `<ag-ui-chat ref={...} />` in JSX and configuring in the ref callback mostly works —
the catalog requests are held back one microtask precisely so a ref assigned in the same commit is
honoured — but the thread-history request is **not** deferred, so that one goes out with whatever
was configured at insertion. It starts at insertion because the restore is what a `sendMessage()`
from the same commit waits on: a restore that had not started yet would have nothing to hold it,
and the send would go out without the conversation.

If your credentials can only arrive later still — an awaited token, a passive effect — call
**`reload()`** once they land:

```js
const token = await auth.login();
chat.getHeaders = () => ({ Authorization: `Bearer ${token}` });
await chat.reload();
```

`reload()` re-runs everything the element loads on startup (tool catalog, skills, thread history)
with the configuration as it then stands. It is a reload, not a merge: the in-flight run is
cancelled and the transcript is rebuilt from the persisted history, so call it when configuration
lands rather than between turns.

### The same boundary in four frameworks

Each framework reaches that pre-insertion window differently, and only one of them reaches it
declaratively. Built and driven in all four:

| Host | Pre-insertion window | What to do |
| --- | --- | --- |
| React | None — refs attach after insertion | `createElement`, configure, `appendChild` (above) |
| **Vue 3** | **Yes** — a directive's `beforeMount` | Attributes in the template, properties in the directive |
| Svelte 5 | None — `use:` actions and `$effect` run after insertion | Same as React |
| Angular | None — bindings apply during change detection | Same as React, in `ngOnInit` with `@ViewChild({ static: true })` |

**Vue** is the one host that can configure declaratively, because a custom directive's `beforeMount`
runs while the element is still detached:

```vue
<script setup>
const vConfigure = {
  beforeMount(element) {
    element.getHeaders = () => ({ Authorization: `Bearer ${token()}` });
    element.registerTool(myTool);
  },
};
</script>

<template>
  <ag-ui-chat v-configure endpoint="/agent/" data-threads-url="/agent/threads/" />
</template>
```

Tell Vue's compiler the tag is a custom element, or it will warn and try to resolve a component:
`vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === "ag-ui-chat" } } })`.

**Svelte 5**'s `use:` action and `$effect` both run after the node is in the DOM, so build the
element by hand in an `$effect` and append it — the React shape, in runes. **Angular** needs
`CUSTOM_ELEMENTS_SCHEMA` on the component and, if it wraps the panel in its own component, one line
of CSS: `:host { display: contents }`. Angular's host element otherwise lands between your grid and
the children it sizes, and the panel renders a few hundred pixels tall in the middle of the page.
