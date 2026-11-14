# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First release of `@artooi/agents-web-components`, the successor of `@artooi/ag-ui-web-component`.
The `ag-ui-` tags, events, parts, slots and `--ag-ui-*` properties keep their names; the README's
move page walks a host over. Each entry below says whether a host opts in.

### Changed

- **The package is `@artooi/agents-web-components`**, and the vendored bundle is
  `dist/agents-web-components.bundle.js`. Opt-in: install the new package, remove the old one, and
  never load both on a page.
- **The element moves to its own entry, `@artooi/agents-web-components/chat`**, which exports
  `AgUiChat` and `defineChat` (was `defineAgUiChat`); the package root keeps everything else, and the
  library build splits the modules the two share so a page holds one instance of each.
  `defineChat()` now throws, naming the tag, when another class already holds the `<ag-ui-chat>`
  tag. The package declares `sideEffects: false`, `./bundle` gains its `types`, and the vendored
  bundle still carries every export and defines nothing at import. Opt-in: a host imports
  `AgUiChat` and `defineChat` from `./chat`; bundle hosts change nothing.
- **Storage keys start with `agents-web-components`** (was `ag-ui-chat`): collapsed state, theme,
  panel size, launcher and dock position, and the built-in conversation store all move to the new
  root, and an element no longer adopts keys written without a namespace. A host opts in to
  nothing; the first deploy forgets the open thread and the saved preferences once. A host that
  reads these keys itself must read the new root.
- **A refused `sessionStorage` write warns once per owner rather than once per page.** One element
  can now warn once for its conversation store, once for its preferences (layout, theme and the
  collapsed state), and once more after a `user-key` change rebuilds its store; each
  `SessionStorageStore.adopt` call warns at most once. Opt-in: none.
- **The markdown sanitiser is recorded as an immutable memo**, and the two copies of the
  quote-offer placement in the transcript are folded into one. No behaviour changes: sanitised
  output, attributes, parts and positions are as before.

### Removed

- **`defineAgUiChat`**, renamed `defineChat` and moved to `./chat`. Opt-in: a host renames the
  import and the call.
- **`AgUiClient.annotatedMessages`**: the getter returned `messages` itself. Opt-in: a host that
  read `annotatedMessages` reads `messages`.
- **`createStateHookTools` and `StateHook`**, the deprecated aliases of `createPageStateTools` and
  `PageState`. Opt-in: a host still importing either name switches to the new one; behaviour is
  identical.
- **`AgUiChat.registerStateHook`**, the deprecated alias of `registerPageState`, which takes the
  same binding and does the same thing. Opt-in: a host still calling it renames the call.
- **The `noResult` string** in `UiStrings`: nothing drew it since a call that never returned is
  answered with `callNotFinished`. A string table that sets it no longer type-checks; delete the
  entry.
- **The adoption of storage keys written without a namespace.** An element used to migrate
  un-namespaced keys into its own on first read; under the new storage root there is nothing to
  migrate. Opt-in: none, bar the one-time reset under Storage keys above.

### Fixed

- **The theme toggle's glyph follows a `theme` written from outside**: setting or removing `theme`
  after the header is drawn (a host's own picker or saved choice) now redraws the toggle, which
  kept offering the moon under `theme="dark"`. Only the toggle's own click redrew it before. A host
  opts in to nothing.

[Unreleased]: https://github.com/Artui/agents-web-components/compare/v0.0.0...HEAD
