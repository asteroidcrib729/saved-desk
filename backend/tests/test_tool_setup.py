import hashlib,io,json,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
from social_downloader import tool_setup as t
from social_downloader.models import MediaFailure

class ToolSetupTests(unittest.TestCase):
 def archive(self,path,entries):
  with zipfile.ZipFile(path,"w") as z:
   for name,value in entries:
    info=zipfile.ZipInfo(name);info.filename=name;info.orig_filename=name;z.writestr(info,value)
 def test_extract_refuses_traversal_before_writing_outside(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);p=root/"bad.zip";self.archive(p,[("../outside",b"bad")])
   with self.assertRaises(MediaFailure):t.extract(p,root/"stage")
   self.assertFalse((root/"outside").exists())
 def test_extract_refuses_duplicate_and_windows_paths(self):
  for entries in [[("a",b"1"),("A",b"2")],[("C:/evil",b"x")],[("a\\evil",b"x")]]:
   with self.subTest(entries=entries),tempfile.TemporaryDirectory() as d:
    p=Path(d)/"a.zip";self.archive(p,entries)
    with self.assertRaises(MediaFailure):t.extract(p,Path(d)/"out")
 def test_fetch_rejects_unapproved_and_insecure_sources(self):
  for url in ["http://www.python.org/file","https://unrelated.test/file","https://user:password@www.python.org/file"]:
   with self.subTest(url=url),tempfile.TemporaryDirectory() as d:
    with self.assertRaises(MediaFailure):t.fetch({"url":url,"sha256":"a"*64,"bytes":1},Path(d)/"archive",lambda *_:None)
 def test_hash_failure_does_not_execute_or_install_anything(self):
  class Response(io.BytesIO):
   def geturl(self):return "https://www.python.org/file"
  with tempfile.TemporaryDirectory() as d,patch.object(t.urllib.request,"urlopen",return_value=Response(b"bad")):
   with self.assertRaises(MediaFailure):t.fetch({"url":"https://www.python.org/file","sha256":"a"*64,"bytes":3},Path(d)/"archive",lambda *_:None)
 def test_failed_setup_preserves_existing_tools_and_removes_only_its_stage(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);kept=root/"tools/owner-tool";kept.mkdir(parents=True);(kept/"keep").write_bytes(b"owner")
   lock={"runtime":{"file":"runtime.zip"},"packages":[]}
   with patch.object(t,"fetch",side_effect=MediaFailure("offline")),self.assertRaises(MediaFailure):t.install(root,lambda *_:None,lock)
   self.assertEqual((kept/"keep").read_bytes(),b"owner")
   self.assertEqual([p.name for p in kept.parent.iterdir()],["owner-tool"])
 def test_success_promotes_verified_environment_and_reuses_without_network(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);runtime=root/"runtime.zip";self.archive(runtime,[("python.exe",b"fixture"),("python314._pth",b"fixture")])
   package=root/"module.zip";self.archive(package,[("module.py",b"fixture")])
   lock={"runtime":{"file":"runtime.zip"},"packages":[{"file":"module.zip"}]}
   def fetch(record,destination,progress):destination.write_bytes((runtime if record["file"]=="runtime.zip" else package).read_bytes())
   with patch.object(t,"fetch",side_effect=fetch),patch.object(t,"validate"):
    path=Path(t.install(root,lambda *_:None,lock));self.assertTrue(path.is_file())
    self.assertIn("import site",(path.parent/"python314._pth").read_text())
    with patch.object(t,"fetch",side_effect=AssertionError("Should not download again")):self.assertEqual(t.install(root,lambda *_:None,lock),str(path))
    (path.parent/"Lib/site-packages/module.py").write_bytes(b"changed")
    with self.assertRaises(MediaFailure):t.install(root,lambda *_:None,lock)
 def test_network_retry_resets_partial_bytes_and_rechecks_integrity(self):
  class Response(io.BytesIO):
   def geturl(self):return "https://www.python.org/file"
  class Interrupted(Response):
   def read(self,*args):
    if self.tell():raise TimeoutError("temporary")
    return super().read(1)
  with tempfile.TemporaryDirectory() as d,patch.object(t.urllib.request,"urlopen",side_effect=[Interrupted(b"x"),Response(b"good")]) as request,patch.object(t.time,"sleep"):
   path=Path(d)/"archive"
   t.fetch({"url":"https://www.python.org/file","sha256":hashlib.sha256(b"good").hexdigest(),"bytes":4},path,lambda *_:None)
   self.assertEqual(path.read_bytes(),b"good")
   self.assertEqual(request.call_count,2)
 def test_network_retry_is_bounded_and_preserves_preexisting_file(self):
  with tempfile.TemporaryDirectory() as d,patch.object(t.urllib.request,"urlopen",side_effect=TimeoutError("temporary")) as request,patch.object(t.time,"sleep"):
   path=Path(d)/"archive";record={"url":"https://www.python.org/file","sha256":"a"*64,"bytes":1}
   with self.assertRaises(MediaFailure):t.fetch(record,path,lambda *_:None)
   self.assertEqual(request.call_count,3)
   path.write_bytes(b"owner")
   with self.assertRaises(FileExistsError):t.fetch(record,path,lambda *_:None)
   self.assertEqual(path.read_bytes(),b"owner")
 def test_integrity_and_nontransient_http_errors_are_not_retried(self):
  class Response(io.BytesIO):
   def geturl(self):return "https://www.python.org/file"
  for response in [Response(b"bad"),t.urllib.error.HTTPError("https://www.python.org/file",403,"Denied",None,None)]:
   with self.subTest(response=type(response).__name__),tempfile.TemporaryDirectory() as d,patch.object(t.urllib.request,"urlopen",side_effect=response if isinstance(response,Exception) else [response]) as request,patch.object(t.time,"sleep"):
    with self.assertRaises(MediaFailure):t.fetch({"url":"https://www.python.org/file","sha256":"a"*64,"bytes":3},Path(d)/"archive",lambda *_:None)
    self.assertEqual(request.call_count,1)
 def test_existing_file_and_relative_directory_are_refused(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/"file";p.write_bytes(b"keep")
   with self.assertRaises(MediaFailure):t.safe_directory(p)
   with self.assertRaises(MediaFailure):t.safe_directory(Path("relative"))
if __name__=="__main__":unittest.main()
