"""Ensure payload proof cannot clear a changed binary inventory or forbidden archive."""
import importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('bundle_audit',Path(__file__).resolve().parents[1]/'audit-worker-bundle.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
@unittest.skipUnless(a.REPORT.exists(),'Build the exclusion-audited worker first.')
class BundleTests(unittest.TestCase):
 def test_current_manifest_matches_every_payload_file(self):self.assertTrue(a.verify())
 def test_changed_manifest_cannot_certify_payload(self):
  with tempfile.TemporaryDirectory() as folder:
   data=json.loads(a.REPORT.read_text());data['files'][0]['sha256']='0'*64
   p=Path(folder)/'proof.json';p.write_text(json.dumps(data))
   with patch.object(a,'REPORT',p):self.assertFalse(a.verify())
 def test_gallery_module_inside_archive_cannot_be_cleared(self):
  real=a.CArchiveReader
  class Contaminated:
   def __init__(self,path):self.inner=real(path);self.toc=self.inner.toc
   def open_embedded_archive(self,name):
    archive=self.inner.open_embedded_archive(name);archive.toc['gallery_dl.extractor.instagram']=None;return archive
  with patch.object(a,'CArchiveReader',Contaminated):
   report=a.inspect();self.assertFalse(report['passed']);self.assertTrue(any('gallery_dl' in f for f in report['findings']))
if __name__=='__main__':unittest.main()
