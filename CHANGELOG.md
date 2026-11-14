# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **The markdown sanitiser is recorded as an immutable memo**, and the transcript's simplify pass folds the two copies of the quote-offer placement into one. No behaviour changes: sanitised output, attributes, parts and positions are as before.
- **The deprecated `noResult` string is removed** from `UiStrings`: nothing drew it since a call that never returned is answered with `callNotFinished`. A string table that sets it no longer type-checks; delete the entry.
- **Storage keys start with `agents-web-components`** (was `ag-ui-chat`): collapsed state, theme, panel size, launcher and dock position, and the built-in conversation store all move to the new root, and an element no longer adopts keys written without a namespace. A host opts in to nothing; the first deploy forgets the open thread and the saved preferences once. A host that reads these keys itself must read the new root.
- **The element moves to its own entry, `@artooi/agents-web-components/chat`**, which exports
  `AgUiChat` and `defineChat`; the package root keeps everything else, and the library build splits
  the modules the two share so a page holds one instance of each. `defineChat()` now throws, naming
  the tag, when another class already holds the `<ag-ui-chat>` tag. The package declares
  `sideEffects: false`, `./bundle` gains its `types`, and the vendored bundle still carries every
  export and defines nothing at import. Opt-in: a host imports `AgUiChat` and `defineChat` from
  `./chat`; bundle hosts change nothing.

### Fixed

- **The theme toggle's glyph follows a `theme` written from outside**: setting or removing `theme` after the header is drawn (a host's own picker or saved choice) now redraws the toggle, which kept offering the moon under `theme="dark"`. Only the toggle's own click redrew it before. A host opts in to nothing.

[Unreleased]: https://github.com/Artui/agents-web-components/compare/v0.0.0...HEAD
