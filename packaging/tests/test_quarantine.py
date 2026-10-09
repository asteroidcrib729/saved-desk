import importlib.util,unittest,tempfile,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location("quarantine",Path(__file__).resolve().parents[1]/"release-quarantine.py")
q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
class QuarantineTests(unittest.TestCase):
 def test_blocked_history_cannot_clear_new_release_gate(self):
  for version in ["0.2.0","0.2.1","0.2.2","0.2.3"]:
   self.assertTrue(q.prohibited(version));self.assertFalse(q.permitted_installer(f"SavedDesk_{version}_x64-setup.exe"))
 def test_new_preview_and_unversioned_binaries_are_distinguished(self):
  self.assertTrue(q.permitted_installer("SavedDesk_0.2.6_x64-setup.exe"))
  self.assertFalse(q.permitted_installer("setup.exe"));self.assertFalse(q.permitted_installer("SavedDesk_0.2.3_x64-setup.exe.bak"))
 def fixture(self):
  tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);root=Path(tmp.name);release=root/"release-artifacts/v0.2.0";release.mkdir(parents=True)
  data=b"Historical test-only bytes";(release/"setup.exe").write_bytes(data)
  (release/"SHA256SUMS.txt").write_text(hashlib.sha256(data).hexdigest()+"  setup.exe\n")
  return root,release,data
 def test_quarantine_preserves_bytes_and_removes_release_candidate(self):
  root,release,data=self.fixture();rows=q.quarantine(root,apply=True)
  self.assertFalse(release.exists());self.assertEqual(len(rows),1)
  self.assertEqual((root/rows[0]["quarantined"]/"setup.exe").read_bytes(),data)
  self.assertFalse(rows[0]["publication_allowed"]);self.assertTrue((root/rows[0]["quarantined"]/"DO-NOT-PUBLISH.txt").exists())
 def test_changed_historical_asset_is_not_moved_or_destroyed(self):
  root,release,data=self.fixture();(release/"setup.exe").write_bytes(b"changed")
  with self.assertRaises(ValueError):q.quarantine(root,apply=True)
  self.assertTrue(release.exists());self.assertFalse((root/".cache/quarantined-releases/v0.2.0").exists())
if __name__=="__main__":unittest.main()
