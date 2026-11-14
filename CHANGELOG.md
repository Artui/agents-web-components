# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **The element moves to its own entry, `@artooi/agents-web-components/chat`**, which exports
  `AgUiChat` and `defineChat`; the package root keeps everything else, and the library build
  splits the modules the two share so a page holds one instance of each. `defineChat()` now
  throws, naming the class, when another class already holds the `<ag-ui-chat>` tag. The package
  declares `sideEffects: false`, and the vendored bundle still carries every export and defines
  nothing at import. Opt-in: a host imports `AgUiChat` and `defineChat` from `./chat`; bundle
  hosts change nothing.

[Unreleased]: https://github.com/Artui/agents-web-components/compare/v0.0.0...HEAD
