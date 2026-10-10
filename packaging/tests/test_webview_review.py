"""Keep EXE and MSIX WebView2 provenance separate on clean build runners."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("licenses", Path(__file__).resolve().parents[1] / "collect-licenses.py")
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)

class WebViewReviewTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.runtime = self.root / "desktop/src-tauri/resources/webview2"
        self.runtime.mkdir(parents=True)
        (self.root / "packaging").mkdir()
        (self.root / "licensing").mkdir()
        (self.root / "licensing/WEBVIEW2-LICENSE.txt").write_text("Microsoft terms fixture")
        (self.runtime / "msedgewebview2.exe").write_bytes(b"verified runtime fixture")
        self.pin = {"version": "155.0.4283.45", "sha256": "a" * 64,
                    "url": "https://msedge.sf.dl.delivery.mp.microsoft.com/fixture.cab",
                    "terms": "licensing/WEBVIEW2-LICENSE.txt"}
        (self.root / "packaging/msix-runtime.json").write_text(json.dumps(self.pin))
        self.review = {"version": self.pin["version"], "cab_sha256": self.pin["sha256"],
                       "source_url": self.pin["url"], "signature": "Valid Microsoft",
                       "files": [{"path": "msedgewebview2.exe", "sha256": c.digest(self.runtime / "msedgewebview2.exe")}]}
        self.write_review()

    def write_review(self):
        (self.runtime / "saveddesk-runtime-review.json").write_text(json.dumps(self.review))

    def test_fixed_runtime_passes_without_any_exe_prerequisite_cache(self):
        record = c.review_webview_distribution("fixed-runtime", self.root)
        self.assertEqual(record["name"], "microsoft-webview2-fixed")
        self.assertEqual(record["source_url"], self.pin["url"])
        self.assertIsNone(c.review_webview_distribution("offline-installer", self.root))
        self.assertFalse((self.root / ".cache/webview-runtime").exists())

    def test_changed_and_extra_runtime_files_are_rejected(self):
        engine = self.runtime / "msedgewebview2.exe"
        engine.write_bytes(b"changed runtime")
        self.assertIsNone(c.review_webview_distribution("fixed-runtime", self.root))
        engine.write_bytes(b"verified runtime fixture")
        (self.runtime / "unreviewed.dll").write_bytes(b"extra fixture")
        self.assertIsNone(c.review_webview_distribution("fixed-runtime", self.root))

    def test_wrong_archive_version_source_or_signature_is_rejected(self):
        for key, value in [("cab_sha256", "b" * 64), ("version", "154.0.0.0"),
                           ("source_url", "https://example.invalid/other.cab"), ("signature", "UnknownError")]:
            with self.subTest(key=key):
                original = self.review[key]
                self.review[key] = value
                self.write_review()
                self.assertIsNone(c.review_webview_distribution("fixed-runtime", self.root))
                self.review[key] = original
        self.write_review()

    def test_missing_terms_or_engine_cannot_clear_fixed_runtime(self):
        terms = self.root / "licensing/WEBVIEW2-LICENSE.txt"
        terms.unlink()
        self.assertIsNone(c.review_webview_distribution("fixed-runtime", self.root))
        terms.write_text("Microsoft terms fixture")
        (self.runtime / "msedgewebview2.exe").unlink()
        self.assertIsNone(c.review_webview_distribution("fixed-runtime", self.root))

    def test_traversal_or_duplicate_inventory_entry_is_rejected(self):
        self.review["files"].append({"path": "../../../../outside.exe", "sha256": "c" * 64})
        self.write_review()
        self.assertIsNone(c.review_webview_distribution("fixed-runtime", self.root))
        self.review["files"].pop()
        self.review["files"].append(dict(self.review["files"][0]))
        self.write_review()
        self.assertIsNone(c.review_webview_distribution("fixed-runtime", self.root))

    def test_offline_installer_keeps_its_own_hash_and_terms_requirements(self):
        executable = self.root / ".cache/webview-runtime/installer.exe"
        executable.parent.mkdir(parents=True)
        executable.write_bytes(b"signed installer fixture")
        terms = self.root / "licensing/WEBVIEW2-LICENSE.txt"
        report = {"path": executable.relative_to(self.root).as_posix(), "sha256": c.digest(executable),
                  "signature": "Valid", "license_path": "WEBVIEW2-LICENSE.txt",
                  "license_sha256": c.digest(terms), "version": self.pin["version"], "source_url": "https://example.invalid/offline.exe"}
        (self.root / "licensing/WEBVIEW2-REVIEW.json").write_text(json.dumps(report))
        self.assertEqual(c.review_webview_distribution("offline-installer", self.root)["name"], "microsoft-webview2-offline")
        (self.runtime / "msedgewebview2.exe").write_bytes(b"tampered fixed runtime")
        self.assertIsNone(c.review_webview_distribution("fixed-runtime", self.root))
        self.assertIsNotNone(c.review_webview_distribution("offline-installer", self.root))
        executable.write_bytes(b"tampered installer")
        self.assertIsNone(c.review_webview_distribution("offline-installer", self.root))

if __name__ == "__main__":
    unittest.main()
