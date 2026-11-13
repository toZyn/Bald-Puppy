# Bald Puppy

Bald Puppy is a coding-agent project maintained in [toZyn/Bald-Puppy](https://github.com/toZyn/Bald-Puppy), based on [OpenAI Codex](https://github.com/openai/codex).

The repository contains the Rust CLI, SDKs, packaging tools, and build infrastructure. Internal crate names, executable names, and configuration paths still use `codex` for compatibility.

## Build and run

Install the Rust toolchain pinned in `codex-rs/rust-toolchain.toml`, then run:

```bash
git clone https://github.com/toZyn/Bald-Puppy.git
cd Bald-Puppy/codex-rs
cargo build --bin codex
cargo run --bin codex -- "explain this codebase to me"
```

See [installation and development setup](docs/install.md) for prerequisites, helper tools, and testing commands. Upstream installers and the `@openai/codex` npm package install OpenAI's distribution; build this repository to use its code.

## Repository structure

| Path           | Purpose                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `codex-rs/`    | Rust workspace: CLI, agent runtime, TUI, servers, and supporting crates |
| `codex-cli/`   | Node.js launcher and npm packaging                                      |
| `sdk/`         | TypeScript and Python SDKs                                              |
| `docs/`        | Setup, configuration, usage, and contributor documentation              |
| `scripts/`     | Development, installer, and package tooling                             |
| `tools/`       | Repository lint and build utilities                                     |
| `bazel/`       | Bazel configuration and build support                                   |
| `third_party/` | Third-party integration files, patches, and license notices             |
| `.github/`     | CI, release tooling, and issue templates                                |

The root `justfile` provides development commands. Cargo and Bazel configuration remain at their existing paths because workspace manifests, CI, and release scripts depend on them. See [architecture and maintenance](docs/repository.md) before reorganizing these directories.

## Documentation

- [Getting started](docs/getting-started.md)
- [Installing and building](docs/install.md)
- [Configuration](docs/config.md)
- [Authentication](docs/authentication.md)
- [Contributing](docs/contributing.md)
- [Repository maintenance](docs/repository.md)
- [Security policy](SECURITY.md)

Some usage guides link to upstream Codex documentation while the implementation remains compatible. Those links describe upstream behavior and services.

## License

Licensed under [Apache-2.0](LICENSE). Original attribution is preserved in [NOTICE](NOTICE) and the third-party license files.
