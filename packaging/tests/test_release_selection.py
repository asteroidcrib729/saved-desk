import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec=importlib.util.spec_from_file_location("release_selection",Path(__file__).resolve().parents[1]/"resolve-release.py")
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

class ReleaseSelectionTests(unittest.TestCase):
 def setUp(self):
  self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
  self.root=Path(self.temporary.name)
  self.git("init","-q");self.git("config","user.name","Release test");self.git("config","user.email","release@example.test")
  (self.root/"desktop").mkdir();(self.root/"desktop/package.json").write_text(json.dumps({"version":"0.2.11"}))
  self.git("add",".");self.git("commit","-qm","Fixture")
  self.head=self.git("rev-parse","HEAD")
 def git(self,*args):
  return subprocess.check_output(["git",*args],cwd=self.root,text=True,stderr=subprocess.DEVNULL).strip()
 def test_branch_build_needs_no_tag_and_creates_no_tag(self):
  result=release.select(self.root)
  self.assertEqual(result["release_tag"],"v0.2.11")
  self.assertEqual(result["source_commit"],self.head)
  self.assertEqual(result["tag_matches_source"],"false")
  self.assertEqual(self.git("tag"),"")
 def test_existing_bare_or_prefixed_tag_resolves_same_commit(self):
  self.git("tag","-a","v0.2.11","-m","Fixture")
  for tag in ["0.2.11","v0.2.11"]:
   result=release.select(self.root,tag)
   self.assertEqual(result["source_commit"],self.head);self.assertEqual(result["tag_matches_source"],"true")
 def test_missing_tag_is_actionable_and_preserves_head(self):
  with self.assertRaisesRegex(ValueError,"Leave release_tag blank"):release.select(self.root,"0.2.11")
  self.assertEqual(self.git("rev-parse","HEAD"),self.head)
 def test_branch_or_untrusted_string_is_not_accepted_as_tag(self):
  for value in ["main","--help","v0.2.11\nextra","refs/tags/v0.2.11","v0.2.11;echo bad"]:
   with self.subTest(value=value),self.assertRaises(ValueError):release.select(self.root,value)
 def test_version_mismatch_is_rejected(self):
  self.git("tag","v0.2.12")
  with self.assertRaisesRegex(ValueError,"differs from application version"):release.select(self.root,"v0.2.12")
 def test_draft_requires_matching_published_tag(self):
  with self.assertRaisesRegex(ValueError,"turn create_draft off"):release.select(self.root,draft=True)
  self.git("tag","v0.2.11")
  self.assertEqual(release.select(self.root,draft=True)["tag_matches_source"],"true")
 def test_tag_at_other_commit_does_not_authorize_branch_draft(self):
  self.git("tag","v0.2.11");(self.root/"other.txt").write_text("Later source")
  self.git("add",".");self.git("commit","-qm","Later")
  with self.assertRaisesRegex(ValueError,"selected commit"):release.select(self.root,draft=True)
 def test_explicit_tag_selects_tagged_source_instead_of_newer_branch(self):
  self.git("tag","v0.2.11");(self.root/"desktop/package.json").write_text(json.dumps({"version":"0.2.12"}))
  self.git("add",".");self.git("commit","-qm","Next")
  result=release.select(self.root,"v0.2.11")
  self.assertEqual(result["version"],"0.2.11");self.assertEqual(result["source_commit"],self.head)

if __name__=="__main__":unittest.main()
