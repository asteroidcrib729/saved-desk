"""Validate an unsigned prerelease and prepare supplements without publishing or altering assets."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_GATES = {"historical_preview_policy", "project_license", "redistribution_review", "windows_installer"}
HOST_CHECKS = {
    "previous-install-launch-local-worker", "upgrade-library-settings-volume-history-duplicates",
    "external-tools-preserved-and-functional-after-upgrade",
    "installed-app-minimal-path-no-development-python-environment",
    "upgrade-excludes-obsolete-gallery-and-ffmpeg-payload", "upgrade-media-preserved",
    "license-bundle-and-connector-retained", "uninstall-binaries-and-registration-removed-data-kept",
    "current-installer-fresh-install-launch-retained-library",
    "current-installer-second-uninstall-retains-media",
    "owner-profile-hashes-registrations-shortcuts-restored",
}


def sha(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate(assets: Path, evidence: Path, tag: str, tag_commit: str) -> dict:
    require(bool(re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+", tag)), "Invalid version tag")
    version = tag[1:]
    require(tuple(map(int, version.split("."))) > (0, 2, 3), "Historical preview is quarantined")
    manifest = read(assets / "release-manifest.json")
    report = read(evidence / "acceptance-review.json")
    host = read(evidence / "host-windows.json")
    receipt = read(evidence / "hash-verification.json")
    require(manifest.get("tag") == tag and manifest.get("version") == version, "Manifest/tag mismatch")
    require(bool(re.fullmatch(r"[0-9a-f]{40}", tag_commit)) and
            manifest.get("source_commit") == receipt.get("source_commit") == tag_commit,
            "Source origin does not match the retained tag")
    require(manifest.get("signature_status") == "NotSigned", "This tool prepares unsigned previews only")
    expected_names = {
        "acceptance-review.json", "release-manifest.json", "release-notes.txt", "SHA256SUMS.txt",
        f"SavedDesk_{version}_x64-setup.exe", f"SavedDesk-connector-{version}.zip",
        f"SavedDesk-original-source-{version}.zip", f"SavedDesk-notices-{version}.zip",
        f"SavedDesk-dependency-sources-{version}.zip",
    }
    require(all(p.is_file() and not p.is_symlink() for p in assets.iterdir()) and
            {p.name for p in assets.iterdir()} == expected_names, "Incomplete or unexpected original asset set")
    actual = {name: sha(assets / name) for name in sorted(expected_names)}
    records = receipt.get("assets", [])
    require(len(records) == len(expected_names) and {r.get("name") for r in records} == expected_names,
            "GitHub digest receipt does not cover every asset")
    for record in records:
        require(record.get("github_digest_match") is True and record.get("sha256") == actual[record["name"]],
                "Asset differs from verified GitHub digest: " + record["name"])
    require(receipt.get("github_archive_digest_match") is True and receipt.get("zip_integrity") is True and
            receipt.get("release_manifest_verified") is True, "GitHub artifact verification is incomplete")
    require(receipt.get("dependency_source_records_verified", 0) > 0 and
            receipt.get("source_files_matching_tag", 0) > 0 and
            set(receipt.get("generated_asset_differences", [])) <= {"desktop/src-tauri/icons/icon.icns"},
            "Corresponding source/tag review is incomplete or has unreviewed differences")
    sums = {}
    for line in (assets / "SHA256SUMS.txt").read_text(encoding="utf-8-sig").splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([^/\\]+)", line)
        require(match is not None, "Invalid checksum entry")
        digest, name = match.groups()
        require(name in expected_names - {"SHA256SUMS.txt"} and name not in sums, "Unexpected/duplicate checksum entry")
        sums[name] = digest
    require(sums == {n: h for n, h in actual.items() if n != "SHA256SUMS.txt"}, "Original checksum coverage/match failed")
    manifest_records = manifest.get("assets", [])
    require({r.get("name") for r in manifest_records} == expected_names -
            {"release-manifest.json", "release-notes.txt", "SHA256SUMS.txt"} and len(manifest_records) == 6,
            "Manifest asset inventory is incomplete")
    for record in manifest_records:
        name = record["name"]
        require(record.get("sha256") == actual[name] and record.get("bytes") == (assets / name).stat().st_size,
                "Manifest asset hash/size mismatch: " + name)
    digest = actual[f"SavedDesk_{version}_x64-setup.exe"]
    require(report.get("installer_sha256") == host.get("installer_sha256") == digest,
            "Acceptance/lifecycle evidence belongs to a different installer")
    original = read(assets / "acceptance-review.json")
    require(original.get("installer_sha256") == digest and all(original.get("gates", {}).get(g) is True
            for g in BASE_GATES - {"windows_installer"}), "Original licensing/quarantine gates are not cleared")
    require(all(report.get("gates", {}).get(g) is True for g in BASE_GATES) and
            not report.get("source_review_findings") and not report.get("missing_notice_components"),
            "Required preview acceptance gates are not cleared")
    require(report.get("public_release_ready") is False and report.get("gates", {}).get("trusted_signing") is False,
            "Unsigned preview cannot claim signed-production readiness")
    require(host.get("passed") is True and host.get("clean_machine") is False and
            host.get("environment") == "existing development host, empty temporary app profile" and
            host.get("owner_data_restored") is True and HOST_CHECKS <= set(host.get("checks", [])),
            "Exact-host lifecycle/restoration evidence is incomplete")
    for name in expected_names:
        if name.endswith(".zip"):
            with zipfile.ZipFile(assets / name) as archive:
                require(archive.testzip() is None, "ZIP integrity failed: " + name)
    return {
        "schema": 1, "tag": tag, "source_commit": tag_commit, "installer_sha256": digest,
        "unsigned_preview_ready": True, "public_release_ready": False,
        "requires_manual_publication": True, "gates": report["gates"],
        "original_assets": actual, "source_dirty_in_original_manifest": manifest.get("source_dirty"),
        "source_review": {
            "dependency_source_records_verified": receipt["dependency_source_records_verified"],
            "source_files_matching_tag": receipt["source_files_matching_tag"],
            "generated_asset_differences": receipt.get("generated_asset_differences", []),
        },
        "limitations": ["Unsigned; SignPath approval/integration pending", "Existing Windows host only",
                        "Fresh seven-platform live acceptance is not cleared for this installer"],
    }


def notes(report: dict) -> str:
    tag = report["tag"]
    return f"""# SavedDesk {tag} - unsigned Windows x64 preview

**This is an unsigned prerelease, not a fully accepted signed production release.** Windows may display unknown-publisher or reputation warnings. Review the source and checksums before deciding whether to install.

SavedDesk downloads and organizes supported social media content in a searchable local Windows library, with image viewing, video/audio playback and file management. See the [complete installation and user guide](https://github.com/asteroidcrib729/saved-desk/blob/main/README.md) for supported platforms, account connections, browser connector, external tools and settings.

Download **SavedDesk_{tag[1:]}_x64-setup.exe**. GitHub's automatic source ZIP is not an installer. The Python worker, Node runtime, browser connector and Microsoft's signed offline WebView2 prerequisite are included. Gallery downloads require a separate Python tool environment; video preparation requires separately installed FFmpeg. Gallery-dl and FFmpeg are not bundled. The connector ZIP uses the documented unpacked/temporary installation; browser-store delivery is pending.

## Verification and limitations

All nine original assets match the GitHub build digests and eight entries in the original SHA256SUMS.txt. Source/redistribution review is cleared. This exact installer passed eleven installation, upgrade, launch and uninstall checks on the maintainer's existing Windows host using a temporary empty profile; the owner data was restored. This is not independent certification, a clean-machine/VM result or fresh seven-platform live acceptance for this hash.

Installer SHA-256: `{report['installer_sha256']}`.

The original acceptance-review.json and manifest remain immutable and predate the host follow-up. The separate **SavedDesk-preview-verification-{tag[1:]}.zip** contains the later host/digest evidence and preview-policy result. Its checksum is in PREVIEW_SHA256SUMS.txt; it supplements rather than replaces the original checksums. The original manifest records source_dirty=true because the workflow regenerates resources/licensing records; the source/tag review verified application code and Windows icons, with only the generated macOS ICNS differing. Full notices and corresponding source archives accompany the installer.

The catalog/media are not encrypted, account sessions are Windows-user protected, and no automatic updater is configured. Updates are installed manually. Download only content you are permitted to access and store.

## Code signing policy

SignPath Foundation approval and integration are pending. This preview is unsigned and no current sponsorship is claimed. If approved and operational: Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

[Code signing policy and maintainer roles](https://github.com/asteroidcrib729/saved-desk/blob/main/CODE_SIGNING_POLICY.md) | [Privacy Policy](https://github.com/asteroidcrib729/saved-desk/blob/main/PRIVACY_POLICY.md) | [Terms of Service](https://github.com/asteroidcrib729/saved-desk/blob/main/TERMS_OF_SERVICE.md).

Original SavedDesk code is MIT; bundled components retain their own licenses. Keep the notices and dependency-source attachments with this release.
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    require(not args.output.exists(), "Supplement output already exists; do not overwrite evidence")
    require(not args.output.resolve().is_relative_to(args.assets.resolve()) and
            not args.output.resolve().is_relative_to(args.evidence.resolve()), "Keep supplements separate from originals")
    commit = subprocess.check_output(["git", "rev-parse", "--verify", f"refs/tags/{args.tag}^{{commit}}"],
                                     cwd=ROOT, text=True).strip()
    report = validate(args.assets, args.evidence, args.tag, commit)
    args.output.mkdir(parents=True)
    report_path = args.output / "unsigned-preview-review.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (args.output / "release-page.md").write_text(notes(report), encoding="utf-8")
    bundle = args.output / f"SavedDesk-preview-verification-{args.tag[1:]}.zip"
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.write(report_path, report_path.name)
        for name in ("acceptance-review.json", "host-windows.json", "hash-verification.json", "verification-notes.txt"):
            archive.write(args.evidence / name, name)
    (args.output / "PREVIEW_SHA256SUMS.txt").write_text(
        f"{sha(bundle)}  {bundle.name}\n{sha(report_path)}  {report_path.name}\n", encoding="ascii")
    print(json.dumps({"unsigned_preview_ready": True, "public_release_ready": False,
                      "tag": args.tag, "installer_sha256": report["installer_sha256"],
                      "output": str(args.output), "published": False}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, json.JSONDecodeError, zipfile.BadZipFile) as error:
        raise SystemExit(str(error)) from error
