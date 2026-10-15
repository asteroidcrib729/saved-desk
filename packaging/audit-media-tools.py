"""Verify the separate source-built media distribution and its exact source closure."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PAYLOAD_FILES={"ffmpeg.exe","ffprobe.exe",*("licenses/"+name for name in ["COPYING.GPLv3","COPYING.GPLv2","COPYING.LGPLv2.1","X264-COPYING.txt","MINGW-RUNTIME.txt","GCC-RUNTIME-EXCEPTION.txt","GCC-COPYING3.txt","DAV1D-COPYING.txt"])}
def digest(path):
    with path.open("rb") as stream:return hashlib.file_digest(stream,"sha256").hexdigest()
def review(root=ROOT):
    base=root/"desktop/src-tauri/resources/media-tools"
    proof=json.loads((base/"MEDIA-TOOLS-REVIEW.json").read_text(encoding="utf-8"))
    pin=json.loads((root/"packaging/media-tools/sources.json").read_text())
    if proof.get("recipe_sha256")!=digest(root/"packaging/media-tools/build.sh") or proof.get("source_lock_sha256")!=digest(root/"packaging/media-tools/sources.json"):
        raise ValueError("Media build recipe or source lock differs from its review")
    if proof.get("license")!="GPL-3.0-or-later" or proof.get("source_signature_fingerprint")!="FCF986EA15E6E293A5644F10B4322F04D67658D8":
        raise ValueError("Media license/source signature record is incomplete")
    configuration=proof.get("configuration","")
    if "--enable-gpl" not in configuration or "--enable-version3" not in configuration or "--enable-libx264" not in configuration or "--enable-libdav1d" not in configuration or "--enable-nonfree" in configuration:
        raise ValueError("Unreviewed media configuration")
    expected={f["path"]:f["sha256"] for f in proof["files"]}
    if len(expected)!=len(proof["files"]) or set(expected)!=PAYLOAD_FILES:
        raise ValueError("Invalid media payload inventory")
    actual={}
    for path in base.rglob("*"):
        if path.is_symlink() or path.is_junction():raise ValueError("Linked media payload")
        if path.is_file() and path!=base/"MEDIA-TOOLS-REVIEW.json":actual[path.relative_to(base).as_posix()]=digest(path)
    if actual!=expected:raise ValueError("Media payload differs from its review")
    sources={r["file"]:r for r in proof["sources"]}
    for key in ["ffmpeg","x264","dav1d","compiler_sources"]:
        entry=pin[key]
        if entry["file"] not in sources or sources[entry["file"]]["sha256"]!=entry["sha256"]:raise ValueError("Missing corresponding media sources")
    source_root=root/".cache/redistribution-sources"
    for entry in proof["sources"]:
        path=source_root/entry["file"]
        if not path.resolve().is_relative_to(source_root.resolve()) or not path.is_file() or digest(path)!=entry["sha256"]:
            raise ValueError("Missing or changed corresponding media sources")
    return proof
if __name__=="__main__":
    result=review();print(json.dumps({"passed":True,"payload_files":len(result["files"]),"source_archives":len(result["sources"]),"license":result["license"]}))
