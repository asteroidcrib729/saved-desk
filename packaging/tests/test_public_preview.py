"""Exercise failures that must block an unsigned preview without weakening production gates."""
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("public_preview", Path(__file__).resolve().parents[1] / "prepare-public-preview.py")
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.assets = self.root / "assets"
        self.evidence = self.root / "evidence"
        self.assets.mkdir()
        self.evidence.mkdir()
        self.tag = "v0.2.10"
        self.commit = "1" * 40
        self.installer = self.assets / "SavedDesk_0.2.10_x64-setup.exe"
        self.installer.write_bytes(b"controlled installer fixture")
        for kind in ("connector", "original-source", "notices", "dependency-sources"):
            with zipfile.ZipFile(self.assets / f"SavedDesk-{kind}-0.2.10.zip", "w") as archive:
                archive.writestr("controlled-fixture.txt", "fixture")
        self.original = {"installer_sha256": p.sha(self.installer),
                         "gates": {g: True for g in p.BASE_GATES - {"windows_installer"}}}
        self.dump(self.assets / "acceptance-review.json", self.original)
        (self.assets / "release-notes.txt").write_text("original review notes")
        inventory = [{"name": f.name, "bytes": f.stat().st_size, "sha256": p.sha(f)}
                     for f in self.assets.iterdir() if f.name != "release-notes.txt"]
        self.manifest = {"version": "0.2.10", "tag": self.tag, "source_commit": self.commit,
                         "signature_status": "NotSigned", "source_dirty": True, "assets": inventory}
        self.dump(self.assets / "release-manifest.json", self.manifest)
        self.report = {"installer_sha256": p.sha(self.installer), "public_release_ready": False,
                       "gates": {**{g: True for g in p.BASE_GATES}, "trusted_signing": False,
                                 "live_platform_acceptance": False}}
        self.dump(self.evidence / "acceptance-review.json", self.report)
        self.host = {"installer_sha256": p.sha(self.installer), "passed": True, "clean_machine": False,
                     "environment": "existing development host, empty temporary app profile",
                     "owner_data_restored": True, "checks": sorted(p.HOST_CHECKS)}
        self.dump(self.evidence / "host-windows.json", self.host)
        self.refresh_receipt()

    @staticmethod
    def dump(path, value):
        path.write_text(json.dumps(value), encoding="utf-8")

    def refresh_receipt(self):
        sums = "".join(f"{p.sha(f)}  {f.name}\n" for f in sorted(self.assets.iterdir())
                       if f.name != "SHA256SUMS.txt")
        (self.assets / "SHA256SUMS.txt").write_text(sums, encoding="ascii")
        self.receipt = {"source_commit": self.commit, "github_archive_digest_match": True,
                        "zip_integrity": True, "release_manifest_verified": True,
                        "dependency_source_records_verified": 304, "source_files_matching_tag": 258,
                        "generated_asset_differences": ["desktop/src-tauri/icons/icon.icns"],
                        "assets": [{"name": f.name, "sha256": p.sha(f), "github_digest_match": True}
                                   for f in self.assets.iterdir()]}
        self.dump(self.evidence / "hash-verification.json", self.receipt)

    def validate(self):
        return p.validate(self.assets, self.evidence, self.tag, self.commit)

    def test_unsigned_preview_pass_preserves_production_failure_and_originals(self):
        before = {f.name: p.sha(f) for f in self.assets.iterdir()}
        result = self.validate()
        self.assertTrue(result["unsigned_preview_ready"])
        self.assertFalse(result["public_release_ready"])
        self.assertFalse(result["gates"]["trusted_signing"])
        self.assertFalse(result["gates"]["live_platform_acceptance"])
        self.assertEqual(before, {f.name: p.sha(f) for f in self.assets.iterdir()})
        self.assertIn("Code signing policy", p.notes(result))

    def test_quarantined_version_rejected(self):
        self.tag = "v0.2.3"
        with self.assertRaisesRegex(ValueError, "quarantined"):
            self.validate()

    def test_tag_mismatch_rejected(self):
        self.manifest["tag"] = "v0.2.11"
        self.dump(self.assets / "release-manifest.json", self.manifest)
        with self.assertRaisesRegex(ValueError, "Manifest/tag"):
            self.validate()

    def test_source_commit_mismatch_rejected(self):
        self.commit = "2" * 40
        with self.assertRaisesRegex(ValueError, "Source origin"):
            self.validate()

    def test_changed_installer_rejected(self):
        self.installer.write_bytes(b"changed executable")
        with self.assertRaisesRegex(ValueError, "GitHub digest"):
            self.validate()

    def test_missing_source_archive_rejected(self):
        (self.assets / "SavedDesk-dependency-sources-0.2.10.zip").unlink()
        with self.assertRaisesRegex(ValueError, "asset set"):
            self.validate()

    def test_unexpected_asset_rejected(self):
        (self.assets / "session.txt").write_text("unrelated fixture")
        with self.assertRaisesRegex(ValueError, "asset set"):
            self.validate()

    def test_receipt_requires_all_github_digests(self):
        self.receipt["assets"][0]["github_digest_match"] = False
        self.dump(self.evidence / "hash-verification.json", self.receipt)
        with self.assertRaisesRegex(ValueError, "GitHub digest"):
            self.validate()

    def test_unreviewed_source_difference_rejected(self):
        self.receipt["generated_asset_differences"].append("backend/worker.py")
        self.dump(self.evidence / "hash-verification.json", self.receipt)
        with self.assertRaisesRegex(ValueError, "source/tag review"):
            self.validate()

    def test_wrong_installer_evidence_rejected(self):
        self.report["installer_sha256"] = "0" * 64
        self.dump(self.evidence / "acceptance-review.json", self.report)
        with self.assertRaisesRegex(ValueError, "different installer"):
            self.validate()

    def test_redistribution_failure_rejected(self):
        self.report["gates"]["redistribution_review"] = False
        self.dump(self.evidence / "acceptance-review.json", self.report)
        with self.assertRaisesRegex(ValueError, "acceptance gates"):
            self.validate()

    def test_signing_claim_rejected(self):
        self.report["public_release_ready"] = True
        self.dump(self.evidence / "acceptance-review.json", self.report)
        with self.assertRaisesRegex(ValueError, "production readiness"):
            self.validate()

    def test_unrestored_owner_data_rejected(self):
        self.host["owner_data_restored"] = False
        self.dump(self.evidence / "host-windows.json", self.host)
        with self.assertRaisesRegex(ValueError, "lifecycle/restoration"):
            self.validate()

    def test_missing_uninstall_check_rejected(self):
        self.host["checks"].remove("current-installer-second-uninstall-retains-media")
        self.dump(self.evidence / "host-windows.json", self.host)
        with self.assertRaisesRegex(ValueError, "lifecycle/restoration"):
            self.validate()

    def test_checksum_path_traversal_rejected(self):
        sums = self.assets / "SHA256SUMS.txt"
        sums.write_text("0" * 64 + "  ../outside.exe\n")
        for record in self.receipt["assets"]:
            if record["name"] == sums.name:
                record["sha256"] = p.sha(sums)
        self.dump(self.evidence / "hash-verification.json", self.receipt)
        with self.assertRaisesRegex(ValueError, "checksum entry"):
            self.validate()

    def test_incomplete_checksum_coverage_rejected(self):
        sums = self.assets / "SHA256SUMS.txt"
        sums.write_text(sums.read_text().splitlines()[0] + "\n")
        for record in self.receipt["assets"]:
            if record["name"] == sums.name:
                record["sha256"] = p.sha(sums)
        self.dump(self.evidence / "hash-verification.json", self.receipt)
        with self.assertRaisesRegex(ValueError, "checksum coverage"):
            self.validate()


if __name__ == "__main__":
    unittest.main()
