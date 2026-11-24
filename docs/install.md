# Install

```bash
npm install @artooi/agents-web-components
```

The package ships two builds (see [`package.json` exports](https://github.com/Artui/agents-web-components/blob/main/package.json)):

| Entry | What it is | When to use |
| --- | --- | --- |
| `@artooi/agents-web-components` | ESM library build; `@ag-ui/*` stay **external** | You bundle the app yourself (Vite, webpack, esbuild) and want to dedupe `@ag-ui/*`. |
| `@artooi/agents-web-components/chat` | The same library build's `<ag-ui-chat>` entry: `AgUiChat` and `defineChat` | Beside the root entry; the two share one module instance, so import from both freely. |
| `@artooi/agents-web-components/threads` | `<ag-ui-threads>`, the conversation list for your own bar or rail: `AgUiThreads` and `defineThreads` | Beside `./chat`, when you draw the list of conversations yourself. |
| `@artooi/agents-web-components/threads/bundle` | The same entry as a vendored file, minified, inlining none of the element | Beside `/bundle` with no build step; the main bundle does not carry the list. |
| `@artooi/agents-web-components/inbox` | `<ag-ui-inbox>`, what waits on the user across agents, as a navbar badge or a list: `AgUiInbox` and `defineInbox` | Beside `./chat` and an `<ag-ui-agents>` provider. |
| `@artooi/agents-web-components/inbox/bundle` | The same entry as a vendored file, minified, inlining none of the element or the provider | Beside `/bundle` with no build step; the main bundle does not carry the inbox. |
| `@artooi/agents-web-components/routines` | `<ag-ui-routines>`, the routines editor as an element of its own: `AgUiRoutines` and `defineRoutines` | When the routines live on a page or in a rail of their own, away from the chat. |
| `@artooi/agents-web-components/routines/bundle` | The same entry as a vendored file, minified, inlining none of the chat or the provider | Beside `/bundle`, or alone, with no build step. |
| `@artooi/agents-web-components/skills` | `<ag-ui-skills>`, the stored-skill editor as an element of its own: `AgUiSkills` and `defineSkills` | When the skills live on a page of their own, away from the chat. |
| `@artooi/agents-web-components/skills/bundle` | The same entry as a vendored file, minified, inlining none of the chat or the provider | Beside `/bundle`, or alone, with no build step. |
| `@artooi/agents-web-components/bundle` | ESM bundle with `@ag-ui/*` **inlined**, minified | Drop in via a single `<script type="module">` with no build step. |

## The vendored-bundle story

The `/bundle` entry inlines every dependency into one self-contained ESM file
(`dist/agents-web-components.bundle.js`). This is the artefact intended for **vendoring**: a host
that can't (or won't) run a JS build — for example a Django app — copies the built bundle into its
`static/` directory and serves it directly. `django-admin-agent` re-vendors a pinned built bundle
on every release. For SPA hosts that already have a bundler, import the bare package name instead
so `@ag-ui/client` / `@ag-ui/core` are deduped against the rest of your app.
