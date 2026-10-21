import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("store_readiness",Path(__file__).resolve().parents[1]/"store-readiness.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class StoreReadinessTests(unittest.TestCase):
 def setUp(self):self.review={"store_identity_confirmed":True,"package_sha256":"a"*64,"version":"0.2.12.0","identity_name":m.STORE_IDENTITY["identity_name"],"publisher":m.STORE_IDENTITY["publisher"]}
 def evidence(self,build):return {"source_store_package_sha256":"a"*64,"source_version":"0.2.12.0","passed":True,"owner_data_restored":True,"clean_machine":True,"windows_product_type":1,"windows_build":build,"checks":sorted(m.REQUIRED_CHECKS)}
 def test_both_client_operating_systems_and_all_checks_are_required(self):
  self.assertFalse(m.evaluate(self.review,[])["store_submission_ready"])
  self.assertFalse(m.evaluate(self.review,[self.evidence(19045)])["store_submission_ready"])
  self.assertTrue(m.evaluate(self.review,[self.evidence(19045),self.evidence(26100)])["store_submission_ready"])
 def test_old_package_and_server_and_host_evidence_cannot_satisfy_the_gate(self):
  for change in [{"source_store_package_sha256":"b"*64},{"windows_product_type":3},{"clean_machine":False},{"owner_data_restored":False},{"checks":[]}]:
   evidence=self.evidence(26100);evidence.update(change)
   with self.subTest(change=change):self.assertFalse(m.evaluate(self.review,[self.evidence(19045),evidence])["store_submission_ready"])
 def test_capability_approval_is_never_inferred_from_installer_checks(self):
  self.assertFalse(m.evaluate(self.review,[self.evidence(19045),self.evidence(26100)])["store_certification_received"])
 def test_preview_identity_cannot_claim_store_readiness(self):
  self.review["identity_name"]="SavedDesk.MsixPreview"
  self.assertFalse(m.evaluate(self.review,[self.evidence(19045),self.evidence(26100)])["store_submission_ready"])
