"""Retire uncleared local previews; never upload or destroy historical evidence."""
import argparse,hashlib,json,re,stat
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BLOCKED_MAX=(0,2,3)
def prohibited(version):
    match=re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)",version)
    return bool(match and tuple(map(int,match.groups()))<=BLOCKED_MAX)
def permitted_installer(name):
    match=re.fullmatch(r"SavedDesk_(\d+\.\d+\.\d+)_x64-setup.exe",name)
    return bool(match and not prohibited(match[1]))
def digest(path):
    with path.open("rb") as stream:return hashlib.file_digest(stream,"sha256").hexdigest()
def checked(path,base):
    if not path.resolve().is_relative_to(base.resolve()):raise ValueError("Quarantine path escaped its exact project directory")
    for entry in [*path.parents,path,*path.rglob("*")]:
        if getattr(entry.lstat(),"st_file_attributes",0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:raise ValueError("Linked historical artifacts are refused")
def quarantine(root=ROOT,apply=False):
    releases=root/"release-artifacts";base=root/".cache/quarantined-releases";rows=[]
    for source in sorted(releases.glob("v*")):
        if not source.is_dir() or not prohibited(source.name):continue
        checked(source,releases)
        checks=source/"SHA256SUMS.txt"
        if not checks.is_file():raise ValueError("Historical release lacks its checksum evidence")
        for line in checks.read_text(encoding="utf-8-sig").splitlines():
            sha,name=line.split("  ",1);file=source/name
            if not file.resolve().is_relative_to(source.resolve()) or not file.is_file() or digest(file)!=sha:raise ValueError("Historical checksum does not match; retain and investigate")
        files=[{"file":str(p.relative_to(source)),"sha256":digest(p),"bytes":p.stat().st_size} for p in sorted(source.rglob("*")) if p.is_file()]
        destination=base/source.name
        if destination.exists():raise ValueError("Do not overwrite quarantine evidence")
        rows.append({"version":source.name,"previous":str(source.relative_to(root)),"quarantined":str(destination.relative_to(root)),"files":files,"publication_allowed":False})
        if apply:
            base.mkdir(parents=True,exist_ok=True);checked(base,root/".cache");source.rename(destination)
            (destination/"DO-NOT-PUBLISH.txt").write_text("BLOCKED: unresolved historical bundled-tool redistribution. Local upgrade testing only.\n",encoding="utf-8")
    if apply:
        base.mkdir(parents=True,exist_ok=True)
        report=base/"quarantine-record.json"
        previous=json.loads(report.read_text()) if report.exists() else {"schema":1,"records":[]}
        previous["records"]+=rows;report.write_text(json.dumps(previous,indent=2)+"\n",encoding="utf-8")
    return rows
def verify(root=ROOT):
    base=root/".cache/quarantined-releases";report=base/"quarantine-record.json"
    rows=json.loads(report.read_text(encoding="utf-8"))["records"]
    versions={row["version"] for row in rows}
    if versions!={"v0.2.0","v0.2.1","v0.2.2","v0.2.3"}:raise ValueError("Historical quarantine is incomplete")
    for row in rows:
        directory=root/row["quarantined"];checked(directory,base)
        if (root/row["previous"]).exists():raise ValueError("A quarantined release reappeared in the publishable release directory")
        for file in row["files"]:
            path=directory/file["file"]
            if not path.resolve().is_relative_to(directory.resolve()) or digest(path)!=file["sha256"]:raise ValueError("Quarantine evidence changed")
    return {"passed":True,"versions":sorted(versions),"publication_allowed":False,"immutable_originals_verified":True}
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--apply",action="store_true");p.add_argument("--verify",action="store_true");p.add_argument("--check-version");a=p.parse_args()
    if a.check_version:
        if prohibited(a.check_version):raise SystemExit("Publication/collection of previews through 0.2.3 is permanently blocked.")
    elif a.verify:print(json.dumps(verify(),indent=2))
    else:print(json.dumps(quarantine(apply=a.apply),indent=2))
