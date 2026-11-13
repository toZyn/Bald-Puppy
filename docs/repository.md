# Repository maintenance

## Workspace boundaries

Bald Puppy inherits the Codex monorepo layout. Keep each component with its existing manifest and tests:

- `codex-rs/Cargo.toml` defines the Rust workspace and shared dependencies.
- `pnpm-workspace.yaml` lists the Node.js packages: `codex-cli`, the responses API proxy launcher, and the TypeScript SDK.
- `sdk/python` maintains its own Python packaging configuration.
- Root Bazel files, `bazel/`, and `third_party/` support the alternative build pipeline.
- `scripts/` contains developer and packaging commands; `.github/scripts/` contains CI and release helpers.

Do not rename `codex-rs`, crates, executables, or configuration paths as cosmetic cleanup: build rules, package imports, fixtures, and downstream clients refer to those names.

## What belongs in Git

Commit source code, manifests, lockfiles, required generated protocol schemas, test fixtures, and third-party notices. Keep dependency installations, build output, local environments, logs, and caches out of Git using the existing ignore rules.

Generated schemas, snapshots, Bazel lockfiles, and vendored integration files are required inputs even when they look repetitive. Update them through their generators or build tools rather than deleting them by size or filename alone.

## Automation

Build, test, and release workflows remain in `.github/workflows`. Some inherited release jobs depend on upstream services, signing credentials, or repository variables; retaining them does not imply that Bald Puppy publishes official packages. Review their destinations and credentials before enabling releases.

Upstream-only CLA enforcement, issue triage bots, stale contributor PR closure, and their unused prompt configuration have been removed. Issue templates and code ownership now refer to this repository.

## Cleanup verification

Before removing or moving a file, search for references in source, manifests, scripts, documentation, and workflows. Update references in the same change. Run the affected checks and review `git diff --check` before opening a pull request.
