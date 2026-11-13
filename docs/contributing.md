# Contributing to Bald Puppy

Use the [Bald Puppy issue tracker](https://github.com/toZyn/Bald-Puppy/issues) for bugs, documentation issues, and feature requests concerning this repository.

## Development workflow

1. Follow [the setup guide](install.md) and create a branch for your change.
2. Keep changes focused and follow the conventions of the affected workspace.
3. Run the checks relevant to the changed component. For Rust, use `just fmt`, `just fix -p <crate>`, and `just test -p <crate>`. For repository documentation and JavaScript formatting, install the pinned pnpm dependencies and run `pnpm run format`.
4. Open a pull request describing the problem, the resulting behavior, and the checks run. Include any checks you could not run.

See [repository maintenance](repository.md) for directory responsibilities and cleanup rules. Preserve `LICENSE`, `NOTICE`, and third-party attribution when changing inherited code.

## Reporting bugs

Include your commit or version, operating system, reproduction steps, expected behavior, and actual behavior. Remove credentials and personal information from logs before sharing them.

## Feature requests

Describe the use case and expected outcome. Search existing issues first to avoid duplicates.

## Security

Follow the [security policy](../SECURITY.md) for vulnerability reports.
