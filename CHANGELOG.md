# Changelog

Bald Puppy releases are tracked on the [repository releases page](https://github.com/toZyn/Bald-Puppy/releases).

## Unreleased

## 0.1.0 - 2026-11-14

- Add automatic versioned releases with full platform packages, changelog, checksums, and native x86_64/ARM64 binaries for Linux, Windows, and macOS.

- Add `/connect` with OpenAI-compatible provider templates and custom endpoints, Chat Completions streaming and tools, and provider-owned model discovery through `/model`.

- Clean up upstream-only repository administration, simplify issue templates, and document the Bald Puppy workspace.

## Inherited upstream changes

- Fix missing command lifecycle events when unified exec cannot create a process, preserving approval rejection and sandbox retry behavior. Thanks @Marvinthebored ([#44557](https://github.com/openai/codex/issues/44557)).
