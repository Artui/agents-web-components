# Building and compatibility

## Building the bundle

The build is driven by [esbuild](https://github.com/Artui/agents-web-components/blob/main/esbuild.config.mjs) plus `tsc` for type declarations:

```bash
make build      # node esbuild.config.mjs && tsc -p tsconfig.build.json
```

This produces, into `dist/`:

- `index.js` — the ESM library build; `@ag-ui/*` are left **external** so npm consumers dedupe
  them.
- `agents-web-components.bundle.js` — the **vendored** ESM bundle, every dependency inlined and
  minified, suitable for direct `<script type="module">` embedding.
- `index.d.ts` (+ source maps) — type declarations; emitted `.js` import specifiers are preserved
  so consumers resolve types without extra flags.

There is **no CSS file to load**. The styles are string constants adopted into
the shadow root at construction, so they ship inside the JS and cannot leak into
the host page. Restyle through the [CSS custom properties](theming.md#theming-density-and-placement) and the
`part` attributes, not a stylesheet override.

Other workflow targets (all identical in name to the sibling Python packages):

| Target | What it does |
| --- | --- |
| `make test` | Vitest with a 100% line + branch + function + statement coverage gate. |
| `make lint` | `biome check .` + `tsc --noEmit`. |
| `make format` | `biome format --write .`. |
| `make demo` | Install, build, then serve the demo (`demo/app/`, one page per feature) on port 5173 via `demo/mock-server.mjs`. |

## Compatibility

| Component | Floor | Tested |
| --- | --- | --- |
| Node (tooling/tests only) | 22 | 22, 24 |
| Browsers (runtime target) | Chrome 123, Firefox 120, Safari 17.5 | Chromium |
| `@ag-ui/client`, `@ag-ui/core` | 1.0 | 1.0 |
| django-ag-ui (server) | 0.63.0 | — |

The shipped artefact targets evergreen browsers (Shadow DOM, Custom Elements v1, ES2022). The
browser floor is set by `light-dark()`, which every theme declares its colours with: below Chrome
123, Firefox 120 or Safari 17.5 those colours do not resolve. Node is only the build/test runtime,
not a runtime target.

The server floor is a wire contract rather than a dependency. A tool call's outcome and a user
message's attachment refs travel in `metadata`, since `@ag-ui/client` 1.0 strips every key its
schemas do not declare. Against an older django-ag-ui the chat still runs, but the agent is never
told about an attached file and a failed or declined server-side tool call settles as done.
