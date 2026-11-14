#!/usr/bin/env python3
"""Build and publish complete Bald Puppy packages, never partial platform releases."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tomllib

# Bootstrap the existing package builder before importing its root-dependent modules.
ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("CODEX_REPO_ROOT", str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from codex_package.archive import write_archive  # noqa: E402
from codex_package.cli import parse_package_version  # noqa: E402
from codex_package.layout import validate_package_dir  # noqa: E402
from codex_package.targets import PACKAGE_VARIANTS, TARGET_SPECS  # noqa: E402

TARGETS = tuple(TARGET_SPECS)
FORMATS = ("tar.gz", "tar.xz", "zip")


def version_value(value: str) -> str:
    version = parse_package_version(value)
    if version.split("-", 1)[0].split("+", 1)[0] == "0.0.0":
        raise ValueError("0.0.0 is reserved for source builds")
    return version


def digest(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def run(*args: str, cwd: Path = ROOT, env: dict | None = None) -> str:
    print("+", " ".join(map(str, args)), flush=True)
    return subprocess.check_output(args, cwd=cwd, env=env, text=True).strip()


def changelog_section(changelog: str, version: str) -> str:
    headings = list(re.finditer(r"^##\s+(.+)$", changelog, re.MULTILINE))
    pattern = re.compile(
        rf"\[?v?{re.escape(version)}\]?(?:\s+-\s+\d{{4}}-\d{{2}}-\d{{2}})?$"
    )
    for index, heading in enumerate(headings):
        if pattern.fullmatch(heading.group(1).strip()):
            end = (
                headings[index + 1].start()
                if index + 1 < len(headings)
                else len(changelog)
            )
            section = changelog[heading.end() : end].strip()
            if not section or not re.search(r"^[-*]\s+\S", section, re.MULTILINE):
                raise ValueError(f"Changelog {version} must contain release entries")
            return section
    raise ValueError(f"CHANGELOG.md needs a nonempty '## {version}' section")


def prepare(tag: str, *, allow_untagged: bool = False, root: Path = ROOT) -> dict:
    # Parse before using the tag as a git ref, filename, or workflow output.
    if not tag.startswith("v"):
        raise ValueError("Release tags must start with v, for example v0.1.0")
    version = version_value(tag[1:])
    if (root / "VERSION").read_text().strip() != version:
        raise ValueError("The tag version must match VERSION")
    section = changelog_section((root / "CHANGELOG.md").read_text(), version)
    head = run("git", "rev-parse", "HEAD", cwd=root)
    exists = subprocess.run(
        ["git", "show-ref", "--verify", "--quiet", f"refs/tags/{tag}"], cwd=root
    ).returncode
    if exists == 1 and allow_untagged:
        commit = head
    else:
        commit = run(
            "git", "rev-parse", "--verify", f"refs/tags/{tag}^{{commit}}", cwd=root
        )
    if commit != head:
        raise ValueError("Checkout must be the exact tagged commit")
    metadata = {
        "tag": tag,
        "version": version,
        "commit": commit,
        "prerelease": "-" in version.split("+")[0],
    }
    directory = root / "release-metadata"
    directory.mkdir(exist_ok=True)
    (directory / "release.json").write_text(json.dumps(metadata, indent=2) + "\n")
    notes = f"# Bald Puppy {version}\n\n{section}\n\n"
    notes += (
        "## Downloads\n\n"
        "Choose your OS and architecture from the asset name. Linux has GNU and portable musl builds; "
        "Windows and macOS have x86_64 and ARM64 builds. Archives contain the full runtime, helpers, and ripgrep. "
        "Keep the extracted directory together and run `bin/codex` (`bin/codex.exe` on Windows).\n\n"
        "These are native Linux, Windows, and macOS binaries. Android/Bionic and ARM 32-bit binaries are not currently available.\n\n"
        "Verify downloads with `SHA256SUMS`. See `RELEASE.json` for version, commit, targets, sizes and hashes.\n\n"
        f"Built from `{commit}`. Installation and limitations: `docs/releases.md` in the source archive.\n"
    )
    (directory / "notes.md").write_text(notes)
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as stream:
            for key, value in metadata.items():
                stream.write(
                    f"{key}={str(value).lower() if isinstance(value, bool) else value}\n"
                )
    return metadata


def archive_package(package: Path, output: Path, name: str, formats=FORMATS) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for extension in formats:
        archive = output / f"{name}.{extension}"
        if extension == "tar.xz":
            with tarfile.open(archive, "w:xz", preset=6) as stream:
                for path in sorted(package.rglob("*")):
                    stream.add(path, arcname=path.relative_to(package), recursive=False)
        else:
            write_archive(package, archive, force=False)


def stamp_workspace_version(manifest: Path, version: str) -> None:
    """Stamp only the runner's build copy so clap's compiled --version agrees."""
    version_value(version)
    text = manifest.read_text()
    section = re.search(r"(?ms)^\[workspace\.package\]\s*\n(.*?)(?=^\[|\Z)", text)
    if section is None:
        raise ValueError("Missing workspace.package section")
    body, count = re.subn(
        r'^version\s*=\s*"[^"\n]+"',
        f'version = "{version}"',
        section.group(1),
        count=1,
        flags=re.MULTILINE,
    )
    if count != 1:
        raise ValueError("Missing workspace version")
    manifest.write_text(text[: section.start(1)] + body + text[section.end(1) :])


def third_party_lock_entries(lock: Path) -> list[str]:
    packages = tomllib.loads(lock.read_text())["package"]
    return sorted(
        json.dumps(package, sort_keys=True)
        for package in packages
        if "source" in package
    )


def build(target: str, version: str) -> None:
    version_value(version)
    spec = TARGET_SPECS[target]
    env = dict(os.environ)
    env["STABLE_GIT_COMMIT"] = run("git", "rev-parse", "HEAD")
    if spec.is_windows and target.startswith("x86_64"):
        env["LIBSQLITE3_FLAGS"] = "SQLITE_DISABLE_INTRINSIC"
    cargo_root = ROOT / "codex-rs"
    # Populate the original locked graph before refreshing only workspace versions offline.
    run("cargo", "fetch", "--locked", "--target", target, cwd=cargo_root, env=env)
    locked = third_party_lock_entries(cargo_root / "Cargo.lock")
    stamp_workspace_version(cargo_root / "Cargo.toml", version)
    run("cargo", "update", "--workspace", "--offline", cwd=cargo_root, env=env)
    if third_party_lock_entries(cargo_root / "Cargo.lock") != locked:
        raise ValueError(
            "Stamping a release must not change any third-party dependency"
        )
    output = Path(env.get("CARGO_TARGET_DIR", "target"))
    if not output.is_absolute():
        output = cargo_root / output
    output = output / target / "release"
    cargo = ["cargo", "build", "--locked", "--release", "--target", target]
    if spec.is_linux:
        run(*cargo, "--bin", "bwrap", cwd=cargo_root, env=env)
        # Never change these bytes after compiling the runtime that embeds this digest.
        run("strip", "--strip-debug", "--strip-unneeded", str(output / "bwrap"))
        env["CODEX_BWRAP_SHA256"] = digest(output / "bwrap")
    binaries = [
        "codex",
        "codex-code-mode-host",
        "codex-exec-server",
        "codex-responses-api-proxy",
    ]
    if spec.is_windows:
        binaries += [
            "codex-command-runner",
            "codex-windows-sandbox-setup",
            "codex-windows-sandbox-service",
        ]
    args = [arg for binary in binaries for arg in ("--bin", binary)]
    run(*cargo, *args, cwd=cargo_root, env=env)
    package = ROOT / "release-stage" / target
    package_args = [
        sys.executable,
        str(ROOT / "scripts/build_codex_package.py"),
        "--target",
        target,
        "--package-version",
        version,
        "--package-dir",
        str(package),
        "--cargo-profile",
        "release",
        "--strip",
        "none",
        "--entrypoint-bin",
        str(output / f"codex{spec.exe_suffix}"),
        "--code-mode-host-bin",
        str(output / f"codex-code-mode-host{spec.exe_suffix}"),
        "--exec-server-bin",
        str(output / f"codex-exec-server{spec.exe_suffix}"),
    ]
    if spec.is_linux:
        package_args += ["--bwrap-bin", str(output / "bwrap")]
    if spec.is_windows:
        package_args += [
            "--codex-command-runner-bin",
            str(output / "codex-command-runner.exe"),
            "--codex-windows-sandbox-setup-bin",
            str(output / "codex-windows-sandbox-setup.exe"),
        ]
    run(*package_args, env=env)
    shutil.copy2(
        output / f"codex-responses-api-proxy{spec.exe_suffix}", package / "bin"
    )
    if spec.is_windows:
        shutil.copy2(
            output / "codex-windows-sandbox-service.exe", package / "codex-resources"
        )
    for filename in ("LICENSE", "NOTICE", "CHANGELOG.md", "VERSION"):
        if (ROOT / filename).is_file():
            shutil.copy2(ROOT / filename, package / filename)
    validate_package_dir(package, PACKAGE_VARIANTS["codex"], spec)
    # Test the packaged entrypoint so version discovery and helper paths use the shipped layout.
    text = run(str(package / "bin" / f"codex{spec.exe_suffix}"), "--version", env=env)
    if version not in text:
        raise ValueError(f"Packaged --version does not report {version}: {text}")
    run(str(package / "codex-path" / spec.rg_name), "--version", env=env)
    archive_package(package, ROOT / "dist", f"bald-puppy-{version}-{target}")


def expected_archives(version: str) -> dict[str, str]:
    result = {
        f"bald-puppy-{version}-{target}.{extension}": target
        for target in TARGETS
        for extension in FORMATS
    }
    return result


def inspect_archive(path: Path, version: str, target: str) -> None:
    """Read metadata in place; never extract untrusted paths from job artifacts."""
    import zipfile

    prefix = ""
    runtime_target = target
    suffix = ".exe" if "windows" in runtime_target else ""
    required = {
        prefix + "codex-package.json",
        prefix + f"bin/codex{suffix}",
        prefix + f"bin/codex-code-mode-host{suffix}",
        prefix + f"bin/codex-exec-server{suffix}",
        prefix + f"codex-path/rg{suffix}",
        prefix + f"bin/codex-responses-api-proxy{suffix}",
    }
    if "linux" in runtime_target:
        required.add(prefix + "codex-resources/bwrap")
    if "windows" in runtime_target:
        required |= {
            prefix + "codex-resources/" + name + ".exe"
            for name in (
                "codex-command-runner",
                "codex-windows-sandbox-setup",
                "codex-windows-sandbox-service",
            )
        }
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            metadata = json.loads(archive.read(prefix + "codex-package.json"))
    else:
        with tarfile.open(path) as archive:
            names = set(archive.getnames())
            member = archive.extractfile(prefix + "codex-package.json")
            if member is None:
                raise ValueError(f"Missing package metadata in {path.name}")
            metadata = json.load(member)
    if not required <= names:
        raise ValueError(
            f"Incomplete archive {path.name}: missing {sorted(required - names)}"
        )
    if metadata.get("version") != version or metadata.get("target") != runtime_target:
        raise ValueError(f"Wrong version or target in {path.name}")


def collect(version: str, commit: str, *, root: Path = ROOT) -> None:
    version_value(version)
    metadata = json.loads((root / "release-metadata/release.json").read_text())
    if metadata["version"] != version or metadata["commit"] != commit:
        raise ValueError("Release metadata does not match the built commit and version")
    dist = root / "dist"
    expected = expected_archives(version)
    actual = {path.name for path in dist.iterdir()}
    if actual != set(expected):
        raise ValueError(
            f"Incomplete release: missing={sorted(set(expected) - actual)}, unexpected={sorted(actual - set(expected))}"
        )
    for name, target in expected.items():
        inspect_archive(dist / name, version, target)
    shutil.copy2(root / "release-metadata/notes.md", dist / f"CHANGELOG-v{version}.md")
    assets = [
        {
            "name": path.name,
            "size": path.stat().st_size,
            "sha256": digest(path),
            "target": expected.get(path.name),
        }
        for path in sorted(dist.iterdir())
    ]
    manifest = {**metadata, "assets": assets, "targets": list(TARGETS)}
    (dist / "RELEASE.json").write_text(json.dumps(manifest, indent=2) + "\n")
    sums = "".join(f"{digest(path)}  {path.name}\n" for path in sorted(dist.iterdir()))
    (dist / "SHA256SUMS").write_text(sums)


def verify_upload(assets_file: Path, *, root: Path = ROOT) -> None:
    assets = json.loads(assets_file.read_text())["assets"]
    uploaded = {asset["name"]: asset["size"] for asset in assets}
    expected = {path.name: path.stat().st_size for path in (root / "dist").iterdir()}
    if uploaded != expected:
        raise ValueError(
            "GitHub release assets do not match the complete local asset set"
        )
    for asset in assets:
        digest_value = asset.get("digest")
        if (
            digest_value
            and digest_value != f"sha256:{digest(root / 'dist' / asset['name'])}"
        ):
            raise ValueError(f"Uploaded checksum mismatch: {asset['name']}")


def verify_remote_tag(tag: str, commit: str, *, root: Path = ROOT) -> None:
    version_value(tag.removeprefix("v"))
    refs = run(
        "git",
        "ls-remote",
        "--tags",
        "origin",
        f"refs/tags/{tag}",
        f"refs/tags/{tag}^{{}}",
        cwd=root,
    )
    resolved = dict(line.split()[::-1] for line in refs.splitlines())
    target = resolved.get(f"refs/tags/{tag}^{{}}", resolved.get(f"refs/tags/{tag}"))
    if target is not None and target != commit:
        raise ValueError(
            "The remote version tag points to a different commit; publish a new version"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    preparation = sub.add_parser("prepare")
    preparation.add_argument("--tag", required=True)
    preparation.add_argument("--allow-untagged", action="store_true")
    builder = sub.add_parser("build")
    builder.add_argument("--target", choices=TARGETS, required=True)
    builder.add_argument("--version", type=version_value, required=True)
    collector = sub.add_parser("collect")
    collector.add_argument("--version", type=version_value, required=True)
    collector.add_argument("--commit", required=True)
    sub.add_parser("verify-upload").add_argument("--assets", type=Path, required=True)
    tag_check = sub.add_parser("verify-tag")
    tag_check.add_argument("--tag", required=True)
    tag_check.add_argument("--commit", required=True)
    args = parser.parse_args()
    if args.command == "prepare":
        prepare(args.tag, allow_untagged=args.allow_untagged)
    elif args.command == "build":
        build(args.target, args.version)
    elif args.command == "collect":
        collect(args.version, args.commit)
    elif args.command == "verify-tag":
        verify_remote_tag(args.tag, args.commit)
    else:
        verify_upload(args.assets)


if __name__ == "__main__":
    main()
