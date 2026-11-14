# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Storage keys start with `agents-web-components`** (was `ag-ui-chat`): collapsed state, theme, panel size, launcher and dock position, and the built-in conversation store all move to the new root, and an element no longer adopts keys written without a namespace. A host opts in to nothing; the first deploy forgets the open thread and the saved preferences once. A host that reads these keys itself must read the new root.
- **The element moves to its own entry, `@artooi/agents-web-components/chat`**, which exports
  `AgUiChat` and `defineChat`; the package root keeps everything else, and the library build splits
  the modules the two share so a page holds one instance of each. `defineChat()` now throws, naming
  the tag, when another class already holds the `<ag-ui-chat>` tag. The package declares
  `sideEffects: false`, `./bundle` gains its `types`, and the vendored bundle still carries every
  export and defines nothing at import. Opt-in: a host imports `AgUiChat` and `defineChat` from
  `./chat`; bundle hosts change nothing.
- **`AgUiClient.annotatedMessages` is gone, and a refused `sessionStorage` write warns once per
  owner rather than once per page.** The getter returned `messages` itself. Each conversation store,
  each element's layout preferences and each `SessionStorageStore.adopt` call warn once on their own,
  so a page with two chats warns once for each; the element's collapsed-state write, which has no
  owner, warns on every refused write. Opt-in: none; a host that read `annotatedMessages` reads
  `messages`.

[Unreleased]: https://github.com/Artui/agents-web-components/compare/v0.0.0...HEAD
