"""Protect MSIX identity, architecture and resource-distribution boundaries."""
import importlib.util, struct, tempfile, unittest, xml.etree.ElementTree as ET
from pathlib import Path
spec=importlib.util.spec_from_file_location("msix",Path(__file__).resolve().parents[1]/"msix-package.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class MsixTests(unittest.TestCase):
 def test_identity_escapes_xml_and_retains_connector_capabilities(self):
  root=ET.fromstring(m.manifest("SavedDesk.MsixPreview",'CN=Test & Publisher',"Faraz & Test", "0.2.10.0"))
  self.assertEqual(root.find("{*}Identity").attrib["Publisher"],"CN=Test & Publisher")
  self.assertEqual(root.find("{*}Properties/{*}RegistryWriteVirtualization").text,"disabled")
  self.assertEqual(root.find("{*}Properties/{*}FileSystemWriteVirtualization").text,"disabled")
  self.assertEqual({c.attrib["Name"] for c in root.find("{*}Capabilities")},{"runFullTrust","unvirtualizedResources"})
 def test_reject_invalid_store_identity_and_version(self):
  for name,publisher,version in [("bad name","CN=Test","0.2.10.0"),("SavedDesk.Test","not a publisher","0.2.10.0"),("SavedDesk.Test","CN=Test","0.2.10"),("SavedDesk.Test","CN=Test","0.2.10.1"),("SavedDesk.Test","CN=Test","0.2.65536.0")]:
   with self.subTest(version=version,name=name),self.assertRaises(ValueError): m.manifest(name,publisher,"Test",version)
 def test_reject_x86_and_non_pe_payloads(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/"worker.exe";header=bytearray(64);header[:2]=b"MZ";struct.pack_into("<I",header,60,64)
   p.write_bytes(header+b"PE\0\0"+struct.pack("<H",0x14c))
   with self.assertRaises(ValueError):m.assert_x64(p)
   p.write_bytes(b"not an executable")
   with self.assertRaises(ValueError):m.assert_x64(p)
 def test_reject_private_data_and_excluded_tools(self):
  with tempfile.TemporaryDirectory() as d:
   base=Path(d)
   for name in ["session.dpapi","catalog.db","key.pfx","client_secret_example.json","ffmpeg.exe","ffprobe.exe"]:
    p=base/name;p.write_bytes(b"fixture")
    with self.subTest(name=name),self.assertRaises(ValueError):m.review_tree(base)
    p.unlink()
   (base/"gallery_dl").mkdir();(base/"gallery_dl/__init__.py").write_text("fixture")
   with self.assertRaises(ValueError):m.review_tree(base)
 def test_reviewed_public_ca_bundle_is_retained_but_private_key_is_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   base=Path(d);ca=base/"certifi";ca.mkdir();p=ca/"cacert.pem"
   p.write_bytes(b"-----BEGIN CERTIFICATE-----\npublic CA fixture\n-----END CERTIFICATE-----")
   m.review_tree(base)
   p.write_bytes(b"-----BEGIN " + b"PRIVATE KEY-----\nsecret fixture")
   with self.assertRaises(ValueError):m.review_tree(base)
if __name__=="__main__":unittest.main()
