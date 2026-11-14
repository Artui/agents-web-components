# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Storage keys start with `agents-web-components`** (was `ag-ui-chat`): collapsed state, theme, panel size, launcher and dock position, and the built-in conversation store all move to the new root, and an element no longer adopts keys written without a namespace. A host opts in to nothing; the first deploy forgets the open thread and the saved preferences once. A host that reads these keys itself must read the new root.

[Unreleased]: https://github.com/Artui/agents-web-components/compare/v0.0.0...HEAD
