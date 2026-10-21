import importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("worker_version",ROOT/"packaging/check-worker-version.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class FrozenWorkerVersionTests(unittest.TestCase):
 def test_actual_frozen_worker_matches_this_checkout(self):
  version=json.loads((ROOT/"desktop/package.json").read_text())["version"]
  self.assertTrue(m.check(ROOT/"desktop/src-tauri/resources/worker/saveddesk-worker.exe",version)["passed"])
 def test_inventory_label_cannot_hide_a_different_frozen_version(self):
  with self.assertRaises(ValueError):m.check(ROOT/"desktop/src-tauri/resources/worker/saveddesk-worker.exe","0.0.0")
