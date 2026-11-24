# @artooi/agents-web-components

[![CI](https://github.com/Artui/agents-web-components/actions/workflows/tests.yml/badge.svg)](https://github.com/Artui/agents-web-components/actions/workflows/tests.yml)
[![npm](https://img.shields.io/npm/v/%40artooi%2Fagents-web-components)](https://www.npmjs.com/package/@artooi/agents-web-components)
[![Docs](https://img.shields.io/badge/docs-artui.github.io-blue)](https://artui.github.io/agents-web-components/)
[![License](https://img.shields.io/npm/l/%40artooi%2Fagents-web-components)](https://github.com/Artui/agents-web-components/blob/main/LICENSE)

Framework-free Web Components over the [AG-UI](https://docs.ag-ui.com) protocol. Drop
`<ag-ui-chat>` into any page, SPA or MPA, any framework or none, point it at an AG-UI
endpoint, and you get a streaming chat sidebar that can call tools you register in the
browser. It wraps [`@ag-ui/client`](https://www.npmjs.com/package/@ag-ui/client)'s
`HttpAgent`; no framework, no Django, no admin specifics live here.

**Documentation: <https://artui.github.io/agents-web-components/>**

## Install

```bash
npm install @artooi/agents-web-components
```

Bundle it yourself from the bare entries, or vendor the self-contained
`@artooi/agents-web-components/bundle` file with no build step. The entries and the
vendored-bundle story are in [Install](https://artui.github.io/agents-web-components/install/).

## Quick start

```html
<script type="module">
  import { X_DESTRUCTIVE_KEY, clickElement } from "@artooi/agents-web-components";
  import { defineChat } from "@artooi/agents-web-components/chat";

  // Register <ag-ui-chat>. An explicit call: importing the package defines nothing.
  defineChat();

  const chat = document.querySelector("ag-ui-chat");
  chat.registerTool({
    name: "save_article",
    description: "Save the article. Destructive, asks for confirmation.",
    parameters: { type: "object", properties: {}, [X_DESTRUCTIVE_KEY]: true },
    handler: async () => {
      await clickElement(document.getElementById("save"));
      return "saved";
    },
  });
</script>

<ag-ui-chat endpoint="/agent/" title-text="Assistant"></ag-ui-chat>
```

> [!IMPORTANT]
> **If nothing appears, check that `defineChat()` ran.** Forgetting it looks
> like nothing at all. `<ag-ui-chat>` is then an *unknown element*, which every
> browser renders as an inline 0x0 box, in flow, with no console warning and no
> error, so the page looks finished and the chat is simply absent.
>
> `customElements.get("ag-ui-chat")` in a console answers it in one line.
> `undefined` means the call did not run.

The full walkthrough, with headers, attributes and sending from your own UI, is the
[Quickstart](https://artui.github.io/agents-web-components/quickstart/). A cross-origin API needs
[Authenticating requests](https://artui.github.io/agents-web-components/authentication/).

## The elements

- **`<ag-ui-chat>`** (`./chat`): the chat panel, its transcript, composer, tools and
  inline confirmation. [Core concepts](https://artui.github.io/agents-web-components/concepts/).
- **`<ag-ui-threads>`** (`./threads`): a chat's conversation list, as rows or pills in
  your own chrome. [The conversation list](https://artui.github.io/agents-web-components/threads/).
- **`<ag-ui-agents>`** (root entry): a headless provider that puts one chat in front of
  several agents. [Agents](https://artui.github.io/agents-web-components/agents/#several-agents-under-one-provider).
- **`<ag-ui-inbox>`** (`./inbox`): what waits on the user across agents, as a navbar
  badge or a list. [The inbox](https://artui.github.io/agents-web-components/agents/#what-needs-the-user-across-agents).
- **`<ag-ui-routines>`** (`./routines`): the routines editor on a page, rail or dialog of its
  own, with pluggable time and timezone fields. [The editors](https://artui.github.io/agents-web-components/editors/#the-routines-element).
- **`<ag-ui-skills>`** (`./skills`): the stored-skill editor as an element of its own.
  [The editors](https://artui.github.io/agents-web-components/editors/#the-skills-element). `data-editors="external"` on the chat
  hands its editor buttons to these two elements.

## Topics

- [Authenticating requests](https://artui.github.io/agents-web-components/authentication/): headers (a sync or async `getHeaders`), cookies, trusted origins.
- [Core concepts](https://artui.github.io/agents-web-components/concepts/): the run loop, stopping, tools, confirmation, DOM drivers.
- [Header, collapse and resizing](https://artui.github.io/agents-web-components/header-and-panel/): the header, launcher, bottom bar, resizing.
- [Messages](https://artui.github.io/agents-web-components/messages/): markdown, follow-ups, timestamps, message actions, quoting.
- [Tool calls and sub-agents](https://artui.github.io/agents-web-components/tool-calls/): display modes, delegation, editing a gated call.
- [What the server draws](https://artui.github.io/agents-web-components/server-pushed-ui/): charts, custom renderers, A2UI, MCP Apps.
- [Skills and run notices](https://artui.github.io/agents-web-components/skills/): prompt chips, the slash palette, the skill editor, routines and their time fields.
- [The editors on a page of their own](https://artui.github.io/agents-web-components/editors/): `<ag-ui-routines>`, `<ag-ui-skills>`, binding, requests, `ag-ui-open-editor`.
- [File uploads](https://artui.github.io/agents-web-components/uploads/): attachments and pasting.
- [Host seams](https://artui.github.io/agents-web-components/host-seams/): the SPA route map, page state, the place chip.
- [Durability and resuming](https://artui.github.io/agents-web-components/durability/): surviving full page reloads, resuming a run.
- [Theming, density and placement](https://artui.github.io/agents-web-components/theming/): themes, tokens, parts, slots, placement.
- [Internationalization](https://artui.github.io/agents-web-components/i18n/): the UI strings table.
- [Public API surface](https://artui.github.io/agents-web-components/api/): every export, by area.
- [Building and compatibility](https://artui.github.io/agents-web-components/building/): the build outputs and the supported versions.
- [Moving from `@artooi/ag-ui-web-component`](https://artui.github.io/agents-web-components/migration/).

## Development

`make init`, `make test` (100% coverage gate), `make lint`, `make build`, `make demo`
(every feature in a scenario on port 5173) and `make docs` (the site, strict).
[CHANGELOG](CHANGELOG.md).

## License

[MIT](LICENSE) © Artur Veres
