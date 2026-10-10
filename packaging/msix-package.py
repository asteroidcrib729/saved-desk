"""Stage only reviewed application resources and create a validated x64 MSIX."""
from __future__ import annotations
import sys
import argparse, hashlib, json, re, shutil, struct, subprocess, uuid
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr
ROOT = Path(__file__).resolve().parents[1]
PREVIEW_NAME = "SavedDesk.MsixPreview"

def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def checked_identity(name: str, publisher: str, version: str) -> None:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{2,49}", name):
        raise ValueError("MSIX identity name must be 3-50 ASCII letters, digits, dots or hyphens")
    if not publisher.startswith("CN=") or any(ord(c) < 32 for c in publisher):
        raise ValueError("Use the exact public certificate/Partner Center Publisher distinguished name")
    parts = version.split(".")
    if len(parts) != 4 or any(not p.isdecimal() or int(p) > 65535 for p in parts) or int(parts[0]) == 0 and int(parts[1]) == 0 and int(parts[2]) == 0:
        raise ValueError("Use a nonzero four-part MSIX version with components no larger than 65535")
    if parts[-1] != "0":
        raise ValueError("The final version component is reserved as zero for Store submission")

def manifest(name: str, publisher: str, display: str, version: str) -> str:
    checked_identity(name, publisher, version)
    return f'''<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
 xmlns:desktop6="http://schemas.microsoft.com/appx/manifest/desktop/windows10/6"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap uap10 desktop6 rescap">
 <Identity Name={quoteattr(name)} Publisher={quoteattr(publisher)} Version={quoteattr(version)} ProcessorArchitecture="x64" />
 <Properties>
  <DisplayName>SavedDesk</DisplayName><PublisherDisplayName>{escape(display)}</PublisherDisplayName>
  <Description>A local library for supported social media downloads.</Description><Logo>Assets\\StoreLogo.png</Logo>
  <desktop6:RegistryWriteVirtualization>disabled</desktop6:RegistryWriteVirtualization>
  <desktop6:FileSystemWriteVirtualization>disabled</desktop6:FileSystemWriteVirtualization>
 </Properties>
 <Resources><Resource Language="en-US" /></Resources>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
 <Applications>
  <Application Id="SavedDesk" Executable="saveddesk.exe" uap10:RuntimeBehavior="packagedClassicApp" uap10:TrustLevel="mediumIL">
   <uap:VisualElements DisplayName="SavedDesk" Description="A local media library" BackgroundColor="#111418"
    Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" />
  </Application>
 </Applications>
 <Capabilities><rescap:Capability Name="runFullTrust" /><rescap:Capability Name="unvirtualizedResources" /></Capabilities>
</Package>
'''

def assert_x64(path: Path) -> None:
    with path.open("rb") as stream:
        header = stream.read(64)
        if header[:2] != b"MZ": raise ValueError("Missing PE header: " + str(path))
        stream.seek(struct.unpack_from("<I", header, 60)[0])
        signature = stream.read(6)
    if signature[:4] != b"PE\0\0" or struct.unpack_from("<H", signature, 4)[0] != 0x8664:
        raise ValueError("MSIX payload must be Windows x64: " + str(path))

def review_tree(source: Path) -> None:
    for path in [source, *source.rglob("*")]:
        if path.is_symlink() or path.is_junction(): raise ValueError("Linked resources are not permitted: " + str(path))
        if path.is_file():
            name = path.name.lower()
            public_ca_bundle = name == "cacert.pem" and path.parent.name == "certifi" and b"PRIVATE KEY" not in path.read_bytes()
            if (path.suffix.lower() == ".pem" and not public_ca_bundle) or path.suffix.lower() in {".db", ".sqlite", ".sqlite3", ".dpapi", ".pfx", ".p12", ".key"} or name.startswith("client_secret_") or name in {"ffmpeg.exe", "ffprobe.exe"} or "gallery_dl" in path.parts:
                raise ValueError("Private data or excluded tool in package resources: " + str(path))

def stage(target: Path, destination: Path) -> None:
    proof = json.loads((target / "msix-build-review.json").read_text(encoding="utf-8-sig"))
    if proof.get("mode") != "msix-fixed-runtime" or any(digest(target / name) != proof.get(key) for name, key in [("saveddesk.exe", "application_sha256"), ("saveddesk-native-host.exe", "host_sha256"), ("resources/webview2/msedgewebview2.exe", "runtime_sha256")]):
        raise ValueError("Build the native MSIX edition before packaging; target binaries differ from their build proof")
    for name in ("saveddesk.exe", "saveddesk-native-host.exe", "worker/saveddesk-worker.exe"):
        assert_x64(target / name)
    runtime = target / "resources/webview2"
    assert_x64(runtime / "msedgewebview2.exe")
    review = json.loads((runtime / "saveddesk-runtime-review.json").read_text(encoding="utf-8-sig"))
    pinned = json.loads((ROOT / "packaging/msix-runtime.json").read_text())
    if review["cab_sha256"] != pinned["sha256"]: raise ValueError("Target runtime is not the reviewed pinned distribution")
    expected = {entry["path"]: entry["sha256"] for entry in review["files"]}
    actual = {p.relative_to(runtime).as_posix(): digest(p) for p in runtime.rglob("*") if p.is_file() and p.name != "saveddesk-runtime-review.json"}
    if actual != expected: raise ValueError("Target fixed runtime content differs from its review")
    destination.mkdir(parents=True, exist_ok=False)
    for name in ("saveddesk.exe", "saveddesk-native-host.exe"):
        shutil.copy2(target / name, destination / name)
    for name in ("worker", "browser-connector", "licenses", "resources/webview2"):
        source = target / name
        review_tree(source)
        shutil.copytree(source, destination / name)
    if not (destination / "licenses/WEBVIEW2-LICENSE.txt").is_file(): raise ValueError("Microsoft runtime terms are missing")
    (destination / "Assets").mkdir()
    for name in ("Square150x150Logo.png", "Square44x44Logo.png", "StoreLogo.png"):
        shutil.copy2(ROOT / "desktop/src-tauri/icons" / name, destination / "Assets" / name)
    (destination / "maintenance").mkdir()
    shutil.copy2(ROOT / "packaging/unregister-connector.ps1", destination / "maintenance/unregister-connector.ps1")
    (destination / "Documentation").mkdir()
    for name in ("README.md", "PRIVACY_POLICY.md", "TERMS_OF_SERVICE.md", "CODE_SIGNING_POLICY.md"):
        shutil.copy2(ROOT / name, destination / "Documentation" / name)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--identity-name", default=PREVIEW_NAME)
    parser.add_argument("--publisher", default="CN=SavedDesk MSIX Preview")
    parser.add_argument("--publisher-display-name", default="Faraz Hussain")
    parser.add_argument("--makeappx", required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--store-identity-confirmed", action="store_true")
    args = parser.parse_args()
    if args.store_identity_confirmed:
        identity = json.loads((ROOT / "packaging/msix-store-identity.json").read_text())
        if (args.identity_name, args.publisher, args.publisher_display_name) != (identity["identity_name"], identity["publisher"], identity["publisher_display_name"]):
            raise SystemExit("Store identity differs from the owner-confirmed Product Identity values")
    version = json.loads((ROOT / "desktop/package.json").read_text())["version"] + ".0"
    xml = manifest(args.identity_name, args.publisher, args.publisher_display_name, version)
    output = args.output or ROOT / "release-artifacts/msix" / version / str(uuid.uuid4())
    output = output.resolve()
    if output.exists(): raise SystemExit("Output already exists; keep previous package assets immutable")
    output.mkdir(parents=True)
    staging = ROOT / ".cache/msix-staging" / str(uuid.uuid4())
    stage(ROOT / "desktop/src-tauri/target/release", staging)
    (staging / "AppxManifest.xml").write_text(xml, encoding="utf-8")
    # MakeAppx's schema and semantic validation remain enabled; never use /nv.
    package = output / f"SavedDesk_{version}_x64_unsigned.msix"
    result = subprocess.run([args.makeappx, "pack", "/d", str(staging), "/p", str(package), "/o"], capture_output=True, text=True)
    (output / "makeappx.log").write_text(result.stdout + result.stderr, encoding="utf-8")
    if result.returncode:
        raise SystemExit("MakeAppx validation/packaging failed: " + (result.stdout + result.stderr)[-4000:])
    files = [{"path": p.relative_to(staging).as_posix(), "sha256": digest(p), "bytes": p.stat().st_size} for p in sorted(staging.rglob("*")) if p.is_file()]
    pinned = json.loads((ROOT / "packaging/msix-runtime.json").read_text())
    report = {"schema": 1, "version": version, "identity_name": args.identity_name, "publisher": args.publisher,
              "architecture": "x64", "signature": "unsigned", "store_identity_confirmed": args.store_identity_confirmed,
              "store_submission_ready": False, "staging": str(staging), "package": package.name,
              "package_sha256": digest(package), "package_bytes": package.stat().st_size,
              "runtime": pinned, "restricted_capabilities": ["runFullTrust", "unvirtualizedResources"],
              "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "source_dirty": bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip()), "files": files}
    (output / "msix-review.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    shutil.copy2(staging / "AppxManifest.xml", output / "AppxManifest.xml")
    subprocess.run([sys.executable, str(ROOT / "packaging/verify-msix.py"), str(output)], check=True)
    (output / "SHA256SUMS.txt").write_text("".join(f"{digest(p)}  {p.name}\n" for p in sorted(output.iterdir()) if p.is_file()), encoding="ascii")
    print("MSIX review assets:", output)
