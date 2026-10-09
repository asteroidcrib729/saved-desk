"""Record installed license texts and exact dependency provenance; never invent clearance."""
from __future__ import annotations
import argparse
import hashlib
import importlib.metadata as metadata
import json
import os
import re
import shutil
import subprocess
import sys
import tomllib
import tarfile
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "licensing"
SOURCES = ROOT / ".cache/redistribution-sources"
records = []
missing = []

def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def copy_notice(scope, name, version, path, relative):
    key = hashlib.sha256(relative.encode()).hexdigest()[:10]
    destination = OUT / "texts" / scope / f"{name}-{version}" / f"{key}-{path.name}.txt"
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, destination)
    return {"original": relative, "path": destination.relative_to(OUT).as_posix(), "sha256": digest(destination)}

def notices(folder):
    return sorted(p for p in folder.rglob("*") if p.is_file() and not p.is_symlink() and
                  re.match(r"^(?:licen[cs]e|copying|notice|copyright)(?:[._-].*)?$", p.name, re.I))

def record(scope, name, version, expression, folder, files, source):
    texts = [copy_notice(scope, name, version, p, p.relative_to(folder).as_posix()) for p in files]
    if not texts and (OUT / "UPSTREAM-NOTICES.json").is_file():
        upstream = json.loads((OUT / "UPSTREAM-NOTICES.json").read_text(encoding="utf-8")).get(f"{scope}:{name}@{version}", [])
        for notice in upstream:
            path = OUT / notice["path"]
            if not path.resolve().is_relative_to(OUT.resolve()) or digest(path) != notice["sha256"]: raise RuntimeError("Upstream notice path/checksum mismatch")
            texts.append({"original":notice["url"],"path":notice["path"],"sha256":notice["sha256"]})
    if not texts: missing.append(f"{scope}:{name}@{version}")
    item = {"scope": scope, "name": name, "version": version, "declared_license": expression,
            "source": source, "notices": texts}
    records.append(item)
    return item

def download(url, destination, expected=None):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        temporary = destination.with_name(destination.name + ".part-" + uuid.uuid4().hex)
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "SavedDesk-redistribution-audit"})
            with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as output:
                shutil.copyfileobj(response, output)
            if expected and digest(temporary) != expected: raise RuntimeError(f"Checksum mismatch for {destination.name}")
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)
    actual = digest(destination)
    if expected and actual != expected:
        raise RuntimeError(f"Checksum mismatch for {destination.name}")
    return {"file": destination.name, "url": url, "sha256": actual, "bytes": destination.stat().st_size}

def collect():
    OUT.mkdir(exist_ok=True)
    windows_license=(Path(sys.base_prefix)/"LICENSE.txt").read_text(encoding="utf-8")
    start=windows_license.index("Additional Conditions for this Windows binary build")
    final="file, or by other licenses as marked."
    end=windows_license.index(final,start)+len(final)
    terms=(ROOT/"LICENSE").read_text(encoding="utf-8")+"\nBundled components retain their own license terms. Full original notices are installed in licenses/THIRD_PARTY_NOTICES.txt and its referenced text files.\nThese additional conditions apply only to Microsoft Distributable Code; they do not restrict MIT or GPL-covered code.\n\n"+windows_license[start:end]+"\n"
    (OUT/"INSTALLER-TERMS.txt").write_text(terms,encoding="utf-8")
    locked = {}
    for line in (ROOT / "packaging/requirements-lock.txt").read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            name, version = line.split("=="); locked[name] = version
    for name, version in locked.items():
        distribution = metadata.distribution(name)
        if distribution.version != version: raise RuntimeError(f"Installed pin mismatch: {name}")
        base = Path(distribution.locate_file(""))
        files = [Path(distribution.locate_file(f)) for f in distribution.files or []
                 if re.match(r"^(?:licen[cs]e|copying|notice|copyright)(?:[._-].*)?$", Path(f).name, re.I)]
        record("python", name, version, distribution.metadata.get("License-Expression") or distribution.metadata.get("License"),
               base, files, f"https://pypi.org/project/{name}/{version}/")
    record("runtime", "cpython", sys.version.split()[0], "PSF-2.0 and historical terms",
           Path(sys.base_prefix), [Path(sys.base_prefix) / "LICENSE.txt"], "https://www.python.org/downloads/source/")
    node_version = subprocess.check_output(["node", "--version"], text=True).strip()
    node_license = ROOT / f".cache/node-runtime/{node_version}/LICENSE"
    download(f"https://raw.githubusercontent.com/nodejs/node/{node_version}/LICENSE", node_license)
    record("runtime", "node", node_version, "MIT plus embedded third-party terms", node_license.parent,
           [node_license], f"https://nodejs.org/dist/{node_version}/")
    npm_lock = json.loads((ROOT / "desktop/package-lock.json").read_text(encoding="utf-8"))
    for folder, package in npm_lock["packages"].items():
        if not folder: continue
        location = ROOT / "desktop" / folder
        name = folder.rsplit("node_modules/", 1)[-1].replace("/", "--")
        if not location.is_dir():
            records.append({"scope":"npm-lock-uninstalled", "name":name, "version":package["version"], "declared_license":package.get("license"), "source":package.get("resolved", "see npm lockfile"), "notices":[], "shipped":False})
            continue
        files = notices(location)
        # Avoid duplicate recursive texts from separately inventoried nested dependencies.
        files = [p for p in files if "node_modules" not in p.relative_to(location).parts]
        record("npm", name, package["version"], package.get("license"), location, files,
               package.get("resolved", "see npm lockfile"))
    cargo = ROOT / ".tooling/cargo/bin/cargo.exe"
    env = dict(os.environ)
    if cargo.exists():
        env.update(CARGO_HOME=str(ROOT / ".tooling/cargo"), RUSTUP_HOME=str(ROOT / ".tooling/rustup"))
    else: cargo = "cargo"
    meta = json.loads(subprocess.check_output([str(cargo), "metadata", "--locked", "--format-version", "1", "--filter-platform", "x86_64-pc-windows-msvc", "--manifest-path", str(ROOT / "desktop/src-tauri/Cargo.toml")], env=env))
    for package in meta["packages"]:
        if package["name"] == "saveddesk": continue
        location = Path(package["manifest_path"]).parent
        record("rust", package["name"], package["version"], package["license"], location, notices(location),
               f"https://crates.io/crates/{package['name']}/{package['version']}")
    # The signed, unmodified Microsoft prerequisite retains its separate terms.
    webview_path = OUT / "WEBVIEW2-REVIEW.json"
    webview_reviewed = False
    if webview_path.is_file():
        webview = json.loads(webview_path.read_text(encoding="utf-8-sig"))
        executable = (ROOT / webview["path"]).resolve()
        license_path = OUT / webview["license_path"]
        webview_reviewed = (executable.is_relative_to(ROOT / ".cache/webview-runtime") and executable.is_file()
                            and digest(executable) == webview["sha256"] and webview.get("signature") == "Valid"
                            and license_path.is_file() and digest(license_path) == webview["license_sha256"])
        if webview_reviewed:
            record("runtime", "microsoft-webview2-offline", webview["version"], "Microsoft Edge WebView2 Runtime terms (separate proprietary redistributable)",
                   OUT, [license_path], webview["source_url"])
    # gallery-dl and FFmpeg are acquired separately by users, not redistributed.
    # Their old preview records remain historical and do not clear those installers.
    runtime_review = OUT / "RUNTIME-REVIEW.json"
    if runtime_review.is_file():
        reviewed = json.loads(runtime_review.read_text(encoding="utf-8"))
        if reviewed.get("python") != sys.version.split()[0]: raise RuntimeError("Runtime source review requires refresh for this Python version")
        for external in reviewed.get("external_sources", []):
            for entry in external["notices"]:
                path=OUT/entry["path"]
                if not path.resolve().is_relative_to(OUT.resolve()) or digest(path)!=entry["sha256"]: raise RuntimeError("Runtime notice checksum/path mismatch")
            records.append({"scope":"runtime-external", "name":external["component"], "version":external["tag"], "declared_license":"See verbatim upstream notices and CPython runtime license", "source":external["url"], "notices":external["notices"], "review_basis":external["build_record"], "source_commit":external["commit"]})
    import importlib.util
    spec=importlib.util.spec_from_file_location('bundle_audit',ROOT/'packaging/audit-worker-bundle.py')
    bundle_audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(bundle_audit)
    payload_verified=bundle_audit.verify()
    findings=[] if payload_verified else ['Current worker payload exclusion and own-adapter-source verification is missing or stale.']
    runtime_recorded=runtime_review.is_file() and not reviewed.get("failures") and bool(reviewed.get("runtime_dlls")) and all(item.get("cpython_distribution_match") is True for item in reviewed["runtime_dlls"]) and len(reviewed.get("external_sources",[]))==7
    if not webview_reviewed: findings.append("Bundled Microsoft offline prerequisite signature, hash and applicable terms need verification.")
    if not runtime_recorded: findings.append("Microsoft VC runtime redistributables and CPython external DLLs need their redistribution/source records; package metadata alone is insufficient.")
    data = {"project_license":"MIT", "project_version":npm_lock["version"], "inventory_scope":"installed Python/build dependencies, full Windows-filtered Cargo metadata and npm lock; includes build/test dependencies and vendored notices",
            "components":records, "missing_notice_components":missing,
            "source_review_findings":findings, "runtime_provenance_and_terms_recorded":runtime_recorded,
            "worker_payload_verified":payload_verified, "webview_prerequisite_reviewed":webview_reviewed,
            "external_user_tools":[{"name":"gallery-dl","version":"1.32.14","declared_license":"GPL-2.0-only","shipped":False,"source":"https://github.com/mikf/gallery-dl","qualification":"Requests Apache-2.0 combination is not certified; no upstream permission or license change is claimed."},
                {"name":"FFmpeg","shipped":False,"source":"https://ffmpeg.org/download.html","qualification":"User obtains tools separately; redistributing a chosen build requires its own license and corresponding-source review."}],
            "redistribution_cleared":payload_verified and runtime_recorded and not missing and not findings}
    (OUT / "DEPENDENCIES.json").write_text(json.dumps(data, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    lines = ["SavedDesk third-party notices", "Original SavedDesk code: MIT; third-party licenses remain unchanged.",
             "This inventory includes build dependencies; their presence is not a claim that every component is shipped.",
             "Gallery-dl and FFmpeg are external user installations and are not included in this payload. Historical notices do not certify their old bundles.",
             "Full verbatim notices are in texts/ beside this file. Matching dependency sources must accompany public release assets.", ""]
    for item in records:
        lines.extend([f"{item['scope']}: {item['name']} {item['version']}", f"Declared terms: {item['declared_license']}", f"Source: {item['source']}"])
        lines.extend("Notice: "+entry["path"] for entry in item.get("notices",[]))
        lines.append("")
    (OUT / "THIRD_PARTY_NOTICES.txt").write_text("\n".join(lines), encoding="utf-8")
    return data

def source_archives(data):
    results = []; failures = []; publisher_checksums = []; publisher_metadata = []
    def python_source(item):
        address=f"https://pypi.org/pypi/{item['name']}/{item['version']}/json"
        cached = SOURCES / "metadata" / f"{item['name']}-{item['version']}.json"
        entry = download(address, cached)
        entry["file"] = cached.relative_to(SOURCES).as_posix()
        publisher_metadata.append(entry)
        info = json.loads(cached.read_text(encoding="utf-8"))
        source = next((f for f in info["urls"] if f["packagetype"] == "sdist"), None)
        if not source: raise RuntimeError("No matching source distribution")
        if Path(source["filename"]).name != source["filename"] or "/" in source["filename"] or "\\" in source["filename"]: raise RuntimeError("Unsafe source filename")
        if not re.fullmatch(r"[a-f0-9]{64}", source["digests"]["sha256"]): raise RuntimeError("Invalid publisher checksum")
        return download(source["url"], SOURCES / source["filename"], source["digests"]["sha256"])
    python = [p for p in data["components"] if p["scope"] == "python"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [(item, pool.submit(python_source,item)) for item in python]
        for item, future in futures:
            try: results.append(future.result())
            except Exception as error: failures.append({"component":item["name"],"error":str(error)})
    # Rust registry archives contain exact sources (including MPL-covered files).
    registry = Path(os.environ.get("CARGO_HOME", ROOT / ".tooling/cargo" if (ROOT / ".tooling/cargo").is_dir() else Path.home() / ".cargo")) / "registry/cache"
    checksums = {(p["name"], p["version"]):p.get("checksum") for p in tomllib.loads((ROOT / "desktop/src-tauri/Cargo.lock").read_text(encoding="utf-8"))["package"]}
    for item in data["components"]:
        if item["scope"] != "rust": continue
        filename=f"{item['name']}-{item['version']}.crate"
        cached = next(registry.glob("*/"+filename),None)
        if cached:
            destination = SOURCES / "rust" / filename; destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(cached,destination)
            if digest(destination) != checksums[(item["name"],item["version"])]: raise RuntimeError("Cargo source checksum mismatch: " + filename)
            results.append({"file":"rust/"+filename,"sha256":digest(destination),"bytes":destination.stat().st_size,"url":item["source"]})
        else: failures.append({"component":"rust:"+item["name"],"error":"Source crate absent; retrieve matching Cargo.lock checksum before publication"})
    version = sys.version.split()[0]
    node_version = next(p["version"] for p in data["components"] if p["scope"] == "runtime" and p["name"] == "node")
    for name,url in [(f"Python-{version}.tar.xz",f"https://www.python.org/ftp/python/{version}/Python-{version}.tar.xz"),
                     (f"node-{node_version}.tar.xz",f"https://nodejs.org/dist/{node_version}/node-{node_version}.tar.xz")]:
        try:
            expected = None
            if name.startswith("node-"):
                checks = download(f"https://nodejs.org/dist/{node_version}/SHASUMS256.txt", SOURCES / f"node-{node_version}-SHASUMS256.txt")
                expected = next(line.split()[0] for line in (SOURCES/checks["file"]).read_text(encoding="utf-8").splitlines() if line.split()[-1] == name)
                publisher_checksums.append(checks)
            results.append(download(url,SOURCES/name,expected))
        except Exception as error: failures.append({"component":name,"error":str(error)})
    runtime_review = OUT / "RUNTIME-REVIEW.json"
    if runtime_review.is_file():
        reviewed=json.loads(runtime_review.read_text(encoding="utf-8"))
        for entry in reviewed.get("external_sources",[]):
            path=SOURCES/entry["file"]
            if not path.exists(): download(entry["url"],path,entry["sha256"])
            if not path.resolve().is_relative_to(SOURCES.resolve()) or digest(path)!=entry["sha256"]: raise RuntimeError("Runtime source checksum/path mismatch")
            results.append(entry)
        failures.extend(reviewed.get("failures",[]))
    report={"archives":results,"publisher_checksums":publisher_checksums,"publisher_metadata":sorted(publisher_metadata,key=lambda p:p["file"]),"download_failures":failures,"source_closure_complete":data["redistribution_cleared"] and not failures,"review_findings":data["source_review_findings"]}
    SOURCES.mkdir(parents=True,exist_ok=True)
    (SOURCES/"SOURCE-PROVENANCE.json").write_text(json.dumps(report,indent=2)+"\n")
    return report

if __name__ == "__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--sources",action="store_true");args=parser.parse_args()
    data=collect()
    print(json.dumps({"components":len(records),"notice_files":sum(len(p.get("notices",[])) for p in records),"missing_notice_components":missing,"redistribution_cleared":data["redistribution_cleared"]},indent=2))
    if args.sources:
        sources=source_archives(data)
        print(json.dumps({"source_archives":len(sources["archives"]),"download_failures":sources["download_failures"],"source_closure_complete":sources["source_closure_complete"]},indent=2))
