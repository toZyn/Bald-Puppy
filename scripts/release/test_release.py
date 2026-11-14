"""Exercise real archives, tag validation, and the complete publication gate offline."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import release


VERSION = "1.2.3"
COMMIT = "a" * 40


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def package(self, target):
        package = self.root / "staging" / target
        spec = release.TARGET_SPECS[target]
        files = [
            f"bin/codex{spec.exe_suffix}",
            f"bin/codex-code-mode-host{spec.exe_suffix}",
            f"bin/codex-exec-server{spec.exe_suffix}",
            f"codex-path/rg{spec.exe_suffix}",
            f"bin/codex-responses-api-proxy{spec.exe_suffix}",
        ]
        if spec.is_linux:
            files += ["codex-resources/bwrap"]
        if spec.is_windows:
            files += [
                "codex-resources/" + name + ".exe"
                for name in (
                    "codex-command-runner",
                    "codex-windows-sandbox-setup",
                    "codex-windows-sandbox-service",
                )
            ]
        for filename in files:
            path = package / filename
            path.parent.mkdir(exist_ok=True, parents=True)
            path.write_bytes(b"fake test executable\n")
            path.chmod(0o755)
        (package / "codex-package.json").write_text(
            json.dumps({"version": VERSION, "target": target})
        )
        (package / "VERSION").write_text(VERSION + "\n")
        return package

    def metadata(self):
        directory = self.root / "release-metadata"
        directory.mkdir(exist_ok=True)
        (directory / "release.json").write_text(
            json.dumps(
                {
                    "version": VERSION,
                    "tag": "v" + VERSION,
                    "commit": COMMIT,
                    "prerelease": False,
                }
            )
        )
        (directory / "notes.md").write_text("# Release\n\n- Changed behavior.\n")

    def archives(self):
        for target in release.TARGETS:
            package = self.package(target)
            release.archive_package(
                package, self.root / "dist", f"bald-puppy-{VERSION}-{target}"
            )

    def test_strict_semver(self):
        for value in ("1.2.3", "1.2.3-rc.1", "1.2.3+build.9"):
            self.assertEqual(release.version_value(value), value)
        for value in (
            "0.0.0",
            "0.0.0-rc.1",
            "01.2.3",
            "1.2",
            "1.2.3-01",
            "1.2.3\nX=y",
            "../bad",
            "1.2.3;echo injected",
        ):
            with (
                self.subTest(value=value),
                self.assertRaises((ValueError, release.argparse.ArgumentTypeError)),
            ):
                release.version_value(value)

    def test_build_version_stamp_changes_only_workspace_version(self):
        manifest = self.root / "Cargo.toml"
        manifest.write_text(
            '[workspace]\nmembers = []\n[workspace.package]\nversion = "0.0.0"\nedition = "2024"\n[workspace.dependencies]\nfoo = "9.0.0"\n'
        )
        release.stamp_workspace_version(manifest, VERSION)
        parsed = release.tomllib.loads(manifest.read_text())
        self.assertEqual(parsed["workspace"]["package"]["version"], VERSION)
        self.assertEqual(parsed["workspace"]["package"]["edition"], "2024")
        self.assertEqual(parsed["workspace"]["dependencies"]["foo"], "9.0.0")

    def test_changelog_selects_exact_version_and_excludes_other_sections(self):
        text = "# Changes\n## Unreleased\n- Later.\n## 1.2.3 - 2026-11-14\n- Actual change.\n## 1.2.2\n- Earlier.\n"
        self.assertEqual(release.changelog_section(text, VERSION), "- Actual change.")
        for text in (
            "## Unreleased\n- Not versioned.\n",
            "## 1.2.3\n\n## 1.2.2\n- Earlier.\n",
        ):
            with self.assertRaises(ValueError):
                release.changelog_section(text, VERSION)

    def test_prepare_validates_actual_tagged_git_commit(self):
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        (self.root / "VERSION").write_text(VERSION + "\n")
        (self.root / "CHANGELOG.md").write_text(f"## {VERSION}\n- Release behavior.\n")

        def git(*args):
            return subprocess.run(
                ["git", "-C", str(self.root), *args], check=True, capture_output=True
            )

        git("add", ".")
        git(
            "-c",
            "user.name=Release Test",
            "-c",
            "user.email=test@example.com",
            "commit",
            "-qm",
            "release",
        )
        # Branch-triggered builds may propose an unpublished version without making a tag yet.
        info = release.prepare("v" + VERSION, allow_untagged=True, root=self.root)
        self.assertEqual(info["version"], VERSION)
        git("tag", "v" + VERSION)
        output = self.root / "outputs"
        with patch.dict(os.environ, {"GITHUB_OUTPUT": str(output)}):
            info = release.prepare("v" + VERSION, root=self.root)
        self.assertFalse(info["prerelease"])
        self.assertIn("version=1.2.3\n", output.read_text())
        self.assertIn(
            "Release behavior.", (self.root / "release-metadata/notes.md").read_text()
        )
        git(
            "-c",
            "user.name=Release Test",
            "-c",
            "user.email=test@example.com",
            "commit",
            "--allow-empty",
            "-qm",
            "after tag",
        )
        with self.assertRaisesRegex(ValueError, "exact tagged commit"):
            release.prepare("v" + VERSION, root=self.root)
        (self.root / "VERSION").write_text("9.0.0\n")
        with self.assertRaisesRegex(ValueError, "match VERSION"):
            release.prepare("v" + VERSION, root=self.root)

    def test_all_archive_formats_preserve_runtime_and_executable_mode(self):
        target = "aarch64-unknown-linux-musl"
        package = self.package(target)
        release.archive_package(package, self.root / "dist", "test")
        for extension in release.FORMATS:
            path = self.root / "dist" / f"test.{extension}"
            release.inspect_archive(path, VERSION, target)
            if extension == "zip":
                with zipfile.ZipFile(path) as archive:
                    self.assertTrue(
                        (archive.getinfo("bin/codex").external_attr >> 16) & 0o111
                    )
            else:
                with release.tarfile.open(path) as archive:
                    self.assertTrue(archive.getmember("bin/codex").mode & 0o111)

    def test_archive_rejects_wrong_version_and_missing_helper(self):
        target = "x86_64-pc-windows-msvc"
        package = self.package(target)
        (package / "bin/codex-exec-server.exe").unlink()
        release.archive_package(package, self.root / "dist", "test", ("zip",))
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            release.inspect_archive(self.root / "dist/test.zip", VERSION, target)
        (package / "bin/codex-exec-server.exe").write_bytes(b"test")
        release.archive_package(package, self.root / "dist", "other", ("zip",))
        with self.assertRaisesRegex(ValueError, "Wrong version"):
            release.inspect_archive(self.root / "dist/other.zip", "9.0.0", target)

    def test_collect_requires_every_target_and_format(self):
        self.metadata()
        (self.root / "dist").mkdir()
        with self.assertRaisesRegex(ValueError, "Incomplete release"):
            release.collect(VERSION, COMMIT, root=self.root)
        self.archives()
        release.collect(VERSION, COMMIT, root=self.root)
        manifest = json.loads((self.root / "dist/RELEASE.json").read_text())
        self.assertEqual(manifest["commit"], COMMIT)
        self.assertEqual(len(manifest["assets"]), 25)
        for line in (self.root / "dist/SHA256SUMS").read_text().splitlines():
            expected, name = line.split("  ", 1)
            self.assertEqual(release.digest(self.root / "dist" / name), expected)
        self.assertEqual(
            len((self.root / "dist/SHA256SUMS").read_text().splitlines()), 26
        )

    def test_collect_rejects_metadata_from_another_revision(self):
        self.metadata()
        with self.assertRaisesRegex(ValueError, "does not match"):
            release.collect(VERSION, "b" * 40, root=self.root)

    def test_remote_tag_rejects_different_commit_but_accepts_missing_or_peeled_tag(
        self,
    ):
        for refs in (
            "",
            f"{COMMIT}\trefs/tags/v{VERSION}",
            f"{'b' * 40}\trefs/tags/v{VERSION}\n{COMMIT}\trefs/tags/v{VERSION}^{{}}",
        ):
            with patch("release.run", return_value=refs):
                release.verify_remote_tag("v" + VERSION, COMMIT)
        with (
            patch("release.run", return_value=f"{'b' * 40}\trefs/tags/v{VERSION}"),
            self.assertRaisesRegex(ValueError, "different commit"),
        ):
            release.verify_remote_tag("v" + VERSION, COMMIT)

    def test_upload_gate_rejects_partial_or_corrupted_upload(self):
        dist = self.root / "dist"
        dist.mkdir()
        (dist / "binary.zip").write_bytes(b"test")
        assets_file = self.root / "uploaded.json"
        assets_file.write_text(json.dumps({"assets": []}))
        with self.assertRaisesRegex(ValueError, "complete local"):
            release.verify_upload(assets_file, root=self.root)
        assets = [
            {
                "name": "binary.zip",
                "size": 4,
                "digest": "sha256:" + release.digest(dist / "binary.zip"),
            }
        ]
        assets_file.write_text(json.dumps({"assets": assets}))
        release.verify_upload(assets_file, root=self.root)
        assets[0]["digest"] = "sha256:wrong"
        assets_file.write_text(json.dumps({"assets": assets}))
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            release.verify_upload(assets_file, root=self.root)


if __name__ == "__main__":
    unittest.main()
