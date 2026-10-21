"""Exercise actual cleanup in disposable files and isolated HKCU test keys."""
import hashlib, json, os, subprocess, tempfile, unittest, uuid
from pathlib import Path
if os.name == "nt":
    import winreg

SCRIPT=Path(__file__).resolve().parents[1]/"unregister-connector.ps1"

@unittest.skipUnless(os.name == "nt", "Windows registry and PowerShell integration")
class ConnectorCleanupTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="saveddesk-cleanup-")
        self.root=Path(self.temp.name)/"connector";self.root.mkdir()
        self.registry="Software\\SavedDesk\\CertificationTests\\"+str(uuid.uuid4())
        self.leaf=self.registry+"\\Microsoft\\Edge\\NativeMessagingHosts\\com.saveddesk.connector"
        payload=b"synthetic-owned-host";self.digest=hashlib.sha256(payload).hexdigest()
        self.host=self.root/"connector-bin"/self.digest/"saveddesk-native-host.exe"
        self.host.parent.mkdir(parents=True);self.host.write_bytes(payload)
        self.manifest=self.root/"connector-edge.json"
        self.manifest.write_text(json.dumps({"name":"com.saveddesk.connector","type":"stdio","path":str(self.host)}))
        self.keep=self.root/"prototype-catalog.db";self.keep.write_bytes(b"synthetic-library-keep")
        (self.root/"session-instagram.dpapi").write_bytes(b"synthetic-protected-account-keep")
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER,self.leaf) as key:
            winreg.SetValueEx(key,"",0,winreg.REG_SZ,str(self.manifest))

    def run_cleanup(self,*extra,check=True,registry_base=None,script=SCRIPT):
        result=subprocess.run(["powershell.exe","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",str(script),"-TestMode","-ConnectorDirectory",str(self.root),"-RegistryBase",registry_base or "HKCU:\\"+self.registry,*extra],capture_output=True,text=True,encoding="utf-8-sig",errors="replace",check=False,timeout=30,creationflags=subprocess.CREATE_NO_WINDOW)
        if check and result.returncode:
            self.fail(f"PowerShell cleanup exited {result.returncode}.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}")
        return result

    def exists(self):
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,self.leaf):return True
        except FileNotFoundError:return False

    def test_default_audit_never_changes_registration_or_files(self):
        report=json.loads(self.run_cleanup().stdout)
        self.assertFalse(report["removed"]);self.assertTrue(self.exists());self.assertTrue(self.host.is_file())

    def test_explicit_cleanup_removes_only_owned_resources(self):
        report=json.loads(self.run_cleanup("-Remove").stdout)
        self.assertTrue(report["removed"]);self.assertFalse(self.exists());self.assertFalse(self.host.exists());self.assertFalse(self.manifest.exists())
        self.assertEqual(self.keep.read_bytes(),b"synthetic-library-keep")
        self.assertEqual((self.root/"session-instagram.dpapi").read_bytes(),b"synthetic-protected-account-keep")
        self.assertFalse(report["libraryAndAccountDataRemoved"])

    def test_cleanup_succeeds_without_get_filehash_cmdlet(self):
        wrapper=Path(self.temp.name)/"without-filehash.ps1"
        script=str(SCRIPT).replace("'","''")
        wrapper.write_text(
            "Import-Module Microsoft.PowerShell.Management\n"
            "Import-Module Microsoft.PowerShell.Utility\n"
            "$global:PSModuleAutoLoadingPreference='None'\n"
            "Remove-Item Function:\\Get-FileHash -ErrorAction SilentlyContinue\n"
            "if(Get-Command Get-FileHash -ErrorAction SilentlyContinue){throw 'Hash cmdlet must be unavailable in this fixture.'}\n"
            f"& '{script}' @args\n"
            "if(-not $?){exit 1}\n",encoding="utf-8")
        report=json.loads(self.run_cleanup("-Remove",script=wrapper).stdout)
        self.assertTrue(report["removed"]);self.assertFalse(self.exists());self.assertFalse(self.host.exists())
        self.assertEqual(self.keep.read_bytes(),b"synthetic-library-keep")
        self.assertEqual((self.root/"session-instagram.dpapi").read_bytes(),b"synthetic-protected-account-keep")

    def test_other_installation_registration_is_preserved(self):
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,self.leaf,0,winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key,"",0,winreg.REG_SZ,str(Path(self.temp.name)/"other-install.json"))
        self.run_cleanup("-Remove");self.assertTrue(self.exists())

    def test_changed_binary_and_unrelated_files_are_preserved(self):
        self.host.write_bytes(b"changed-user-file")
        report=json.loads(self.run_cleanup("-Remove").stdout)
        self.assertEqual(self.host.read_bytes(),b"changed-user-file")
        self.assertTrue(any(os.path.samefile(self.host,path) for path in report["preservedChangedArtifacts"]))
        self.assertEqual(self.keep.read_bytes(),b"synthetic-library-keep")

    def test_unrelated_registry_prefix_is_rejected(self):
        result=self.run_cleanup("-Remove",registry_base="HKCU:\\Software\\Unrelated",check=False)
        self.assertNotEqual(result.returncode,0);self.assertTrue(self.host.exists());self.assertTrue(self.exists())
        self.assertIn("Tests require",result.stderr)

    def test_verified_extension_exports_are_removed_and_changed_exports_preserved(self):
        names=("manifest.json","popup.html","popup.js","popup.css")
        def export(browser):
            digest=hashlib.sha256()
            for name in names:digest.update(name.encode());digest.update(name.encode())
            folder=self.root/"browser-extensions"/browser/digest.hexdigest();folder.mkdir(parents=True)
            for name in names:(folder/name).write_bytes(name.encode())
            return folder
        owned=export("edge");changed=export("chrome")
        (changed/"popup.js").write_bytes(b"user-edited-extension")
        report=json.loads(self.run_cleanup("-Remove").stdout)
        self.assertFalse(owned.exists())
        self.assertEqual((changed/"popup.js").read_bytes(),b"user-edited-extension")
        self.assertTrue(any(os.path.samefile(changed,path) for path in report["preservedChangedArtifacts"]))

    def tearDown(self):
        def remove_key(path):
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER,path,0,winreg.KEY_ALL_ACCESS) as key:
                    children=[]
                    while True:
                        try:children.append(winreg.EnumKey(key,len(children)))
                        except OSError:break
                for child in children:remove_key(path+"\\"+child)
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER,path)
            except FileNotFoundError:pass
        assert self.registry.startswith("Software\\SavedDesk\\CertificationTests\\")
        remove_key(self.registry);self.temp.cleanup()

if __name__=="__main__":unittest.main()
