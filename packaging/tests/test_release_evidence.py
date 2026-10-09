"""Ensure owner-host evidence is accepted only for the exact tested installer."""
import hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('release_evidence',Path(__file__).resolve().parents[1]/'release-evidence.py')
e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
CHECKS=['previous-install-launch-local-worker','upgrade-library-settings-volume-history-duplicates','upgrade-media-preserved','license-bundle-and-connector-retained','uninstall-binaries-and-registration-removed-data-kept']
class EvidenceTests(unittest.TestCase):
 def setUp(self):
  self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup);self.root=Path(self.temporary.name);self.evidence=self.root/'evidence';self.evidence.mkdir();self.installer=self.root/'setup.exe';self.installer.write_bytes(b'owned test fixture')
  self.report={'passed':True,'clean_machine':False,'environment':'existing development host, empty temporary app profile','owner_data_restored':True,'installer_sha256':hashlib.sha256(self.installer.read_bytes()).hexdigest(),'checks':CHECKS+['owner-profile-hashes-registrations-shortcuts-restored']}
 def evaluate(self):
  (self.evidence/'host-windows.json').write_text(json.dumps(self.report))
  with patch.object(e,'ROOT',self.root):return e.evaluate(self.installer,self.evidence)
 def test_host_pass_keeps_clean_environment_false_and_other_gates_blocked(self):
  r=self.evaluate();self.assertTrue(r['gates']['windows_installer']);self.assertFalse(r['windows_test_environment']['clean_machine']);self.assertFalse(r['public_release_ready'])
 def test_hash_mismatch_cannot_clear_installer_gate(self):
  self.report['installer_sha256']='0'*64;self.assertFalse(self.evaluate()['gates']['windows_installer'])
 def test_unrestored_owner_profile_cannot_clear_gate(self):
  self.report['owner_data_restored']=False;self.assertFalse(self.evaluate()['gates']['windows_installer'])
 def test_missing_lifecycle_check_cannot_clear_gate(self):
  self.report['checks']=CHECKS[:-1]+['owner-profile-hashes-registrations-shortcuts-restored'];self.assertFalse(self.evaluate()['gates']['windows_installer'])
 def test_unspecified_test_environment_cannot_clear_gate(self):
  self.report['environment']='unknown';self.assertFalse(self.evaluate()['gates']['windows_installer'])
 def test_fresh_guest_route_still_requires_matching_installer(self):
  self.report['passed']=False
  clean={'passed':True,'fresh_guest':True,'installer_sha256':hashlib.sha256(self.installer.read_bytes()).hexdigest(),'checks':CHECKS}
  (self.evidence/'clean-windows.json').write_text(json.dumps(clean));r=self.evaluate();self.assertTrue(r['gates']['windows_installer']);self.assertTrue(r['windows_test_environment']['clean_machine'])
if __name__=='__main__':unittest.main()
