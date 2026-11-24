# agents-web-components

A **framework-free** `<ag-ui-chat>` Web Component over the [AG-UI](https://docs.ag-ui.com)
protocol. Drop it into any page — SPA or MPA, any framework or none — point it at an AG-UI
endpoint, and you get a streaming chat sidebar that can call tools you register in the browser.

It wraps [`@ag-ui/client`](https://www.npmjs.com/package/@ag-ui/client)'s `HttpAgent` and ships:

- A Custom Element with a self-contained Shadow DOM chat UI (header, scrolling transcript,
  input row), themeable via CSS custom properties.
- A pluggable **client-side tool registry** — `registerTool({ name, description, parameters,
  handler })`; every registered tool is added to each run's `RunAgentInput.tools`.
- Generic **DOM-driver primitives** (`fillField`, `clickElement`, `setControlValue`) and
  **animation primitives** (`typeInto`, `highlightThenClick`, …) so the agent can drive the page
  at human-readable speed.
- An **inline confirmation card** that intercepts tool calls needing confirmation (those whose
  JSON Schema carries `x-destructive: true`, or a per-call `confirmPredicate`) before the handler
  runs — rendered right in the transcript, never a modal overlay.
- **Markdown + HTML rendering** of assistant replies (sanitized `marked` + DOMPurify), with
  themes, density/placement presets, incoming-text animations, tool-call display modes, an
  animated thinking indicator, and an opt-in **skills** palette (prompt chips + `/`-commands).
- A **new-chat** button and a **collapse** toggle built into the header.
- An **MPA durability story**: a durable conversation store, a stable thread id, and a resumable
  run loop that survives full page reloads (`x-navigates` + `navigationResult`).
- **Host seams** for SPAs: a route map, an auto-injected page map, page state, and an optional
  `navigate()` callback.

No framework, no Django, no admin specifics live here. Downstream consumers (e.g.
`django-admin-agent`) register their own tool handlers on top via the pluggable registry.

This package is the successor of `@artooi/ag-ui-web-component`. Coming from it? See
[Moving from `@artooi/ag-ui-web-component`](migration.md).

## The elements

| Element | Entry | What it is |
| --- | --- | --- |
| `<ag-ui-chat>` | `@artooi/agents-web-components/chat` | The chat panel: transcript, composer, tools, confirmation. Start with the [quickstart](quickstart.md). |
| `<ag-ui-threads>` | `@artooi/agents-web-components/threads` | A chat's conversation list, as rows or pills in your own chrome. See [the conversation list](threads.md). |
| `<ag-ui-agents>` | `@artooi/agents-web-components` | A headless provider that puts one chat in front of several agents. See [agents and the inbox](agents.md#several-agents-under-one-provider). |
| `<ag-ui-inbox>` | `@artooi/agents-web-components/inbox` | What waits on the user across agents, as a navbar badge or a list. See [agents and the inbox](agents.md#what-needs-the-user-across-agents). |
| `<ag-ui-routines>` | `@artooi/agents-web-components/routines` | The routines editor as an element of its own, for a settings page, a rail or a dialog. See [the editors](editors.md#the-routines-element). |
| `<ag-ui-skills>` | `@artooi/agents-web-components/skills` | The stored-skill editor as an element of its own. See [the editors](editors.md#the-skills-element). |

Each entry also ships as a vendored `/bundle` file for hosts with no build step; see
[install](install.md).
