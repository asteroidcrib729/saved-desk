import hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("media",Path(__file__).resolve().parents[1]/"audit-media-tools.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class MediaReviewTests(unittest.TestCase):
 def fixture(self,root):
  base=root/"desktop/src-tauri/resources/media-tools";base.mkdir(parents=True)
  sources=root/".cache/redistribution-sources";sources.mkdir(parents=True)
  recipe=root/"packaging/media-tools";recipe.mkdir(parents=True);(recipe/"build.sh").write_text("controlled recipe")
  pin={};records=[]
  for name in ["ffmpeg","x264","dav1d","compiler_sources"]:
   p=sources/(name+".tar");p.write_bytes(name.encode());entry={"file":p.name,"sha256":m.digest(p)};pin[name]=entry;records.append(entry)
  (recipe/"sources.json").write_text(json.dumps(pin))
  files=[]
  for name in sorted(m.PAYLOAD_FILES):
   p=base/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(name.encode());files.append({"path":name,"sha256":m.digest(p)})
  proof={"recipe_sha256":m.digest(recipe/"build.sh"),"source_lock_sha256":m.digest(recipe/"sources.json"),"license":"GPL-3.0-or-later","source_signature_fingerprint":"FCF986EA15E6E293A5644F10B4322F04D67658D8","configuration":"--enable-gpl --enable-version3 --enable-libx264 --enable-libdav1d","files":files,"sources":records}
  (base/"MEDIA-TOOLS-REVIEW.json").write_text(json.dumps(proof));return base,sources
 def test_complete_separate_payload_and_sources_pass(self):
  with tempfile.TemporaryDirectory() as d:self.fixture(Path(d));self.assertIsNotNone(m.review(Path(d)))
 def test_changed_binary_source_recipe_or_extra_dll_blocks_distribution(self):
  for target in ["binary","source","recipe","extra"]:
   with self.subTest(target=target),tempfile.TemporaryDirectory() as d:
    root=Path(d);base,sources=self.fixture(root)
    p={"binary":base/"ffmpeg.exe","source":sources/"x264.tar","recipe":root/"packaging/media-tools/build.sh","extra":base/"unknown.dll"}[target];p.write_bytes(b"changed")
    with self.assertRaises(ValueError):m.review(root)
 def test_missing_probe_blocks_media_package(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);base,_=self.fixture(root);(base/"ffprobe.exe").unlink()
   with self.assertRaises(ValueError):m.review(root)
if __name__=="__main__":unittest.main()
