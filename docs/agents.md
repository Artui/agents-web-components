# Agents and the inbox

## Several agents under one provider

A host that serves more than one agent (django-ag-ui 0.87.0's `AgentsDirectory`) can put one
chat in front of all of them. `<ag-ui-agents>` is a headless provider: it draws nothing, reads the
directory of agents and keeps the inbox of every agent's threads fresh, and mounts its chat on one
agent at a time.

```html
<ag-ui-agents id="home" data-agents-url="/agents-home/agents/"
              data-inbox-url="/agents-home/inbox/" data-inbox-transport="stream"
              style="display: contents">
  <ag-ui-threads></ag-ui-threads>
  <ag-ui-chat></ag-ui-chat>
</ag-ui-agents>

<script type="module">
  import { defineAgents } from "@artooi/agents-web-components";
  import { defineChat } from "@artooi/agents-web-components/chat";
  import { defineThreads } from "@artooi/agents-web-components/threads";
  defineAgents();
  defineChat();
  defineThreads();
</script>
```

- **The directory.** `data-agents-url` answers `{ agents: [...] }`, each entry an `id`, `name`,
  `description`, `endpoint` and one URL per route its mount serves (`null` for one it does not),
  and from django-ag-ui 0.88.1 its `capabilities`. It is read on connect and by `refresh()`, with the last ETag, and listed in **`agents`**
  *(read-only)* and **`ag-ui-agents-change`** (`AGENTS_CHANGE_EVENT`, detail `{ agents }`).
- **Its chat** is the first `<ag-ui-chat>` inside it, or the element set as **`chat`**.
- **Switching agents is a remount.** The chat is mounted on the entry **`agent`** names (the
  first entry without it): taken out of the document, given the entry's `endpoint`,
  `data-tools-url`, `data-threads-url`, `data-runs-url`, `data-skills-url`,
  `data-skill-editor-url`, `data-routines-url`, `data-attachments-url` and
  `data-transcribe-url` (removed where the entry has `null` or no such key), and put back where it was. That is how a chat applies its
  [connect-time attributes](quickstart.md#when-each-attribute-is-read), so no warning is raised, and like any
  remount it cancels a run in flight. Setting `agent` (attribute or property) switches;
  **`ag-ui-agent-change`** (`AGENT_CHANGE_EVENT`, detail `{ agent }`) fires each time. The
  getter answers the id of the entry the chat is on.
- **What the agent declares.** **`getCapabilities()`** resolves the mounted entry's
  `capabilities`, AG-UI's `AgentCapabilities` as `AbstractAgent.getCapabilities()` answers it,
  or `undefined` before a listing and for an entry from a server that predates them. A host can
  hide a control the agent lacks, reading it on `ag-ui-agent-change` and again on
  `ag-ui-agents-change` (a re-listing can change it without a switch). An undeclared key is
  absent, never `false`: hide on a declaration (`humanInTheLoop` missing from a declared set,
  `reasoning.supported === false`), never on `undefined`. Declarations are informative; the
  chat draws whatever the stream sends.
- **Each agent keeps its own conversations.** The chat's built-in store is replaced by one under
  the entry's id (`agent:<id>`, plus `#<user-key>` when one is set), so each agent has its own
  thread pointer, history and messages, and coming back to an agent restores where it was. A
  store of your own kind, a `RemoteConversationStore` you made included, is left alone and keeps
  its own keying, across every switch, even one to an entry whose `threads_url` wraps it in the
  chat's remote; the layout preferences stay on the chat's own `id`. Two chats on one entry on
  the same page (two providers listing it) are kept apart as two chats on one namespace are: the
  second gets a throwaway namespace and a console warning.
- **The inbox.** `data-inbox-url` answers `{ threads: [...] }` in the `threads/` shape, every
  row with its `agent_id`. It is watched while connected, by ETag polling every five seconds or,
  when `data-inbox-transport` is `stream`, by the server's event stream (polled when the server
  answers with JSON). Each change is in **`inbox`** *(read-only)* and
  **`ag-ui-inbox-change`** (`INBOX_CHANGE_EVENT`, detail `{ threads }`), each row a `ThreadMeta`
  with `agentId`. **`openThread(agentId, threadId)`** mounts the chat on that agent and opens the
  thread; for an agent the directory does not list (yet), it opens nothing.
- **A child session on another agent opens through the provider.** The provider listens to its
  chat's cancelable [`ag-ui-open-thread`](tool-calls.md#child-sessions). When `detail.agentId` names a listed
  entry other than the one mounted, it calls `preventDefault()` and `openThread(agentId,
  threadId)`, so a child link or the parent breadcrumb switches agent and shows the thread. The
  same agent, an agent the directory does not list and a `null` `agentId` are left alone, and the
  chat opens the thread in place; so is a request a listener on the chat prevented first. The
  `agentId` is the directory entry's `id`: a child-session receipt's `agent_id`, or a parent's
  `scope`.
- **Requests** carry **`headers`**, **`getHeaders()`** (winning per key) and the
  **`credentials`** attribute, as on the chat. They are the provider's own; the chat keeps its
  own for its requests. **`request(url, init?)`** is the public `fetch` that sends them, the one
  an `<ag-ui-routines>` or `<ag-ui-skills>` under the provider calls; `init.headers` win per key
  and `init.credentials` wins over the attribute. **`data-retry-unauthorized`**
  (`retryUnauthorized`) sends a directory or inbox read, or a `GET` through `request()`, once
  more after a `401`, as on the chat; see
  [Retrying a 401 once](authentication.md#retrying-a-401-once).

The provider is exported from the root entry (and so from `/bundle`) with `defineAgents`, which
throws naming the tag when another class holds it. A lone `<ag-ui-chat>` needs none of this and
works as it always has. Runs and reattach stay in the chat. The element is an ordinary inline
element, so give it `display: contents` when it should not affect layout.

## An agents home

A home page for a host with several agents is three elements you already have under one
`<ag-ui-agents>` provider: what waits on the user (`<ag-ui-inbox variant="list">`), the
conversations of the agent in front (`<ag-ui-threads>`), and the chat as the page
(`<ag-ui-chat placement="page">`). There is no home element and no new attribute: copy the whole
page, or only the pieces you need, each imported from its own entry.

```html
<ag-ui-agents id="home" data-agents-url="/agents-home/agents/"
              data-inbox-url="/agents-home/inbox/" style="display: contents">
  <header><ag-ui-inbox></ag-ui-inbox></header>
  <aside>
    <ag-ui-inbox variant="list"></ag-ui-inbox>
    <ag-ui-threads></ag-ui-threads>
  </aside>
  <ag-ui-chat placement="page" data-greeting="off"></ag-ui-chat>
</ag-ui-agents>

<style>
  /* header 52px, rail 292px wide; the rail is a 220px strip under the header at 640px and below */
  header {
    position: fixed; inset: 0 0 auto 0; height: 52px;
    display: flex; justify-content: flex-end; align-items: center;
    z-index: calc(var(--ag-ui-z-index, 2147483000) + 1);
  }
  aside { position: fixed; inset: 52px auto 0 0; width: 292px; overflow-y: auto; }
  ag-ui-chat {
    --ag-ui-inset: 52px 0 0 292px;
    --ag-ui-width: calc(100vw - 292px);
    --ag-ui-height: calc(100dvh - 52px);
  }
  @media (max-width: 640px) {
    aside { inset: 52px 0 auto 0; width: auto; height: 220px; }
    ag-ui-chat {
      --ag-ui-inset: 272px 0 0 0;
      --ag-ui-width: 100vw;
      --ag-ui-height: calc(100dvh - 272px);
    }
  }
</style>

<script type="module">
  import { defineAgents } from "@artooi/agents-web-components";
  import { defineChat } from "@artooi/agents-web-components/chat";
  import { defineThreads } from "@artooi/agents-web-components/threads";
  import { defineInbox } from "@artooi/agents-web-components/inbox";
  defineAgents();
  defineChat();
  defineThreads();
  defineInbox();
</script>
```

- **Each piece stays its own entry.** Drop the inbox and leave out `./inbox`; drop the list and
  leave out `./threads`; a lone chat needs no provider. The inbox list and the threads need the
  provider only for the agents and the inbox they read.
- **The header sits above the chat, its badge at the far end.** A fixed header is its own stacking context, so it takes one more than the chat's `--ag-ui-z-index`, or the page chat paints over the inbox popover, which opens toward the start from the badge, so the header pushes the badge to the end.
- **The chat is the page, fixed to the viewport.** `placement="page"` sizes itself to the
  viewport whatever `--ag-ui-inset` says, so state the box you leave with the inset, width and
  height tokens together, as above, and set `data-greeting="off"` where the page has its own
  heading. At 640px and below the rail becomes a scrolling strip under the header and the chat
  sits beneath it, so the inbox list and the threads stay reachable; the demo does the same.
  Switching the agent remounts the chat, as [described above](#several-agents-under-one-provider).
- **Try it.** `make demo`, then `/agents/` for the whole page and `/agents/alone.html?piece=inbox`
  (or `threads`, `chat`) for one piece imported alone, both against the mock server.

## What needs the user, across agents

`<ag-ui-inbox>` shows the conversations that wait on the user, across every agent of an
[`<ag-ui-agents>` provider](#several-agents-under-one-provider): a run parked on an approval, a
question, or a client tool a detached run could not call. As a badge it is a count for your
navbar that opens the list; as a list it is the "needs you" section of a home page. It keeps
nothing of its own: it reads the provider's `inbox`, which the provider keeps fresh by ETag
polling or by SSE as `data-inbox-transport` says, and redraws on each `ag-ui-inbox-change`.

```html
<nav><ag-ui-inbox agents="home"></ag-ui-inbox></nav>

<ag-ui-agents id="home" data-agents-url="/agents-home/agents/"
              data-inbox-url="/agents-home/inbox/" style="display: contents">
  <section><ag-ui-inbox variant="list"></ag-ui-inbox></section>
  <ag-ui-chat></ag-ui-chat>
</ag-ui-agents>

<script type="module">
  import { defineAgents } from "@artooi/agents-web-components";
  import { defineChat } from "@artooi/agents-web-components/chat";
  import { defineInbox } from "@artooi/agents-web-components/inbox";
  defineAgents();
  defineChat();
  defineInbox();
</script>
```

- **What it counts.** One row per conversation whose `status` is `waiting` with at least one
  interrupt. The badge's number is the number of rows, not of interrupts; a row parked on several
  calls says how many more after its first. **`items`** *(read-only)* is the rows, in the
  provider's order (newest first). The host carries `data-count`, and `data-empty` when nothing
  waits.
- **Binding.** `agents` names the provider's `id`, looked up in the inbox's own root, so a badge
  in a navbar outside the provider still reads it; a provider added later is picked up when it
  first lists its inbox or directory. Without `agents`, the nearest `<ag-ui-agents>` around it.
  Or set the **`provider`** property, which wins until it is set back to `null`.
- **`variant`.** `badge` (the default) is a button with the count that opens the list in a
  popover below it, aligned to its inline end; a press outside it or Escape closes it (Escape
  hands focus back to the badge), and the arrow keys move between rows. **`open`** reads and sets
  whether the popover is open. `list` draws the list alone, with its empty text and no badge.
- **Each row** names the conversation (`untitled` when it has none) and its agent, then what it
  waits on: `approval` (marked `destructive` unless the server says `destructive: false`),
  `question`, or `external` for any other kind, followed by the interrupt's message.
- **Picking a row** fires **`ag-ui-inbox-select`** (`INBOX_SELECT_EVENT`, detail
  `{ agentId, threadId }`, bubbling, composed and cancelable) and closes the popover, then calls
  the provider's `openThread(agentId, threadId)`, which mounts the chat on that agent and opens
  the conversation, where the approval or question is answered. Call `preventDefault()` to route
  to it yourself, on another page for instance.
- **Answering in place.** A row whose every interrupt is an approval marked
  `destructive: false`, whose agent the provider's directory lists, on a server that names the
  parked run (`run_id` on a waiting row, django-ag-ui 0.88.0 with a `step_store`), also shows
  **Approve** and **Deny**. Either answers every call of the row at once: it POSTs the agent's
  `resume/<run_id>/` (under its `endpoint`, with or without a trailing slash) with a detached
  run, the provider's `headers`, `getHeaders()` and `credentials` (so a session mount's CSRF
  header goes there), and fires **`ag-ui-inbox-answer`** (`INBOX_ANSWER_EVENT`, detail
  `{ agentId, threadId, runId, approved, outcome, status }`, bubbling and composed). `outcome` is
  `answered`, `elsewhere` (a `409` or `404`: another answer, or the run's end, got there first)
  or `failed`, which draws `answerFailed` under the row and lets it be sent again. A destructive
  approval, a question, a client tool, a row whose agent is not listed, and every row on an older
  server are answered in their conversation only. The row leaves when the provider's inbox next
  lists it as answered. Keyboard focus stays on the control it was on (or the row's button, once
  Approve is busy) as the list redraws.
- **`strings`** translates every piece of text (`label`, `badge` with `{count}`, `empty`,
  `untitled`, `approval`, `question`, `external`, `destructive`, `more` with `{count}`,
  `approve`, `deny`, `answerFailed`), merged over the English.
- **Styling.** Parts `badge`, `icon`, `count`, `panel`, `heading`, `list`, `row`, `row-button`,
  `mark`, `agent`, `summary`, `destructive`, `actions`, `approve-button`, `deny-button`,
  `answer-error`, `empty`. The chat's colour tokens apply, plus
  `--ag-ui-waiting` (the count and the marks) and `--ag-ui-danger` (a destructive approval), in
  the page's own `color-scheme`, since it sits in your chrome. The badge's popover stacks one
  above `--ag-ui-z-index` (the chat's layer, `2147483000` by default), so it opens over a floating
  `<ag-ui-chat>`. A navbar that creates its own stacking context (`position: fixed` or `sticky`,
  `transform`, `backdrop-filter`, an `opacity` below 1) caps it there: give that navbar a
  `z-index` above the chat's, or place the badge outside it.

The main `/bundle` does not carry the element. Without a build step, load `/inbox/bundle` beside
it; it inlines neither the chat nor the provider, which come from `/bundle`.
