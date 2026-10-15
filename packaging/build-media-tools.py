"""Controlled Windows x64 FFmpeg/libx264 build, with independently verified sources."""
import argparse,hashlib,importlib.util,json,os,shutil,subprocess,tarfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/".cache/store-remediation"
SOURCE=CACHE/"sources"
def digest(path):
    with path.open("rb") as stream:return hashlib.file_digest(stream,"sha256").hexdigest()
def run(args,**kwargs):
    subprocess.run([str(a) for a in args],check=True,**kwargs)
def download(record):
    path=SOURCE/record["file"];path.parent.mkdir(parents=True,exist_ok=True)
    if not path.is_file() or digest(path)!=record["sha256"]:
        temporary=path.with_suffix(path.suffix+".download")
        run(["curl.exe","--fail","--location","--proto","=https","--connect-timeout","15","--max-time","300","--retry","2","--output",temporary,record["url"]])
        if digest(temporary)!=record["sha256"]:raise ValueError("Publisher download checksum mismatch: "+record["file"])
        temporary.replace(path)
    return path
def build(reuse=False):
    pin=json.loads((ROOT/"packaging/media-tools/sources.json").read_text())
    paths={key:download(record) for key,record in pin.items() if isinstance(record,dict)}
    git=Path(os.environ.get("ProgramFiles","C:/Program Files"))/"Git"
    gpg=git/"usr/bin/gpg.exe";bash=git/"bin/bash.exe"
    # Forward-slash relative paths keep Git's MSYS build of gpg inside this keyring.
    home=".cache/store-remediation/gpg"
    (ROOT/home).mkdir(parents=True,exist_ok=True)
    signature=SOURCE/"ffmpeg-9.0.2.tar.xz.asc";key=SOURCE/"ffmpeg-devel.asc"
    for path,url in [(signature,"https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz.asc"),(key,"https://ffmpeg.org/ffmpeg-devel.asc")]:
        if not path.is_file():run(["curl.exe","-fL","--proto","=https","--max-time","90","--output",path,url])
    run([gpg,"--homedir",home,"--batch","--import",key.relative_to(ROOT).as_posix()],cwd=ROOT,capture_output=True)
    verified=subprocess.run([str(gpg),"--homedir",home,"--batch","--status-fd","1","--verify",signature.relative_to(ROOT).as_posix(),paths["ffmpeg"].relative_to(ROOT).as_posix()],cwd=ROOT,capture_output=True,text=True)
    fingerprint="FCF986EA15E6E293A5644F10B4322F04D67658D8"
    if verified.returncode or "VALIDSIG "+fingerprint not in verified.stdout:raise ValueError("Official FFmpeg source signature failed")
    if not reuse:
        toolchain=ROOT/".tooling/ffmpeg-build"
        if not (toolchain/"w64devkit/bin/gcc.exe").is_file():
            seven=shutil.which("7z.exe") or "C:/Program Files/7-Zip/7z.exe"
            run([seven,"x",paths["compiler"],"-o"+str(toolchain),"-y"],stdout=subprocess.DEVNULL)
        with zipfile.ZipFile(paths["assembler"]) as z:z.extractall(toolchain/"nasm")
        with zipfile.ZipFile(paths["meson"]) as z:z.extractall(toolchain/"meson")
        for name in ["ffmpeg","x264","dav1d"]:
            with tarfile.open(paths[name]) as t:t.extractall(CACHE/"build",filter="data")
        with (CACHE/"media-build.log").open("w") as log:run([bash,"--noprofile","--norc","packaging/media-tools/build.sh"],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
    prefix=CACHE/"media-prefix";output=ROOT/"desktop/src-tauri/resources/media-tools"
    output.mkdir(parents=True,exist_ok=True)
    for name in ["ffmpeg.exe","ffprobe.exe"]:shutil.copy2(prefix/"bin"/name,output/name)
    configuration=subprocess.check_output([str(output/"ffmpeg.exe"),"-buildconf"],text=True,stderr=subprocess.STDOUT)
    if "--enable-nonfree" in configuration:raise ValueError("Non-redistributable FFmpeg configuration")
    notices=output/"licenses";notices.mkdir(exist_ok=True)
    ffmpeg=CACHE/"build/ffmpeg-9.0.2";x264=CACHE/"build/x264-c24e06c2e184345ceb33eb20a15d1024d9fd3497"
    for name in ["COPYING.GPLv3","COPYING.GPLv2","COPYING.LGPLv2.1"]:shutil.copy2(ffmpeg/name,notices/name)
    shutil.copy2(x264/"COPYING",notices/"X264-COPYING.txt")
    shutil.copy2(ROOT/".tooling/ffmpeg-build/w64devkit/COPYING.MinGW-w64-runtime.txt",notices/"MINGW-RUNTIME.txt")
    with tarfile.open(paths["compiler_sources"]) as archive:
        gcc=next(m for m in archive if m.name.startswith("source/gcc-") and m.name.endswith(".tar.xz"))
        with tarfile.open(fileobj=archive.extractfile(gcc),mode="r:xz") as sources:
            needed={"COPYING.RUNTIME":"GCC-RUNTIME-EXCEPTION.txt","COPYING3":"GCC-COPYING3.txt"}
            for member in sources:
                name=member.name.rsplit("/",1)[-1]
                if member.name.count("/")==1 and name in needed:
                    (notices/needed.pop(name)).write_bytes(sources.extractfile(member).read())
                    if not needed:break
            if needed:raise ValueError("Compiler runtime license sources are incomplete")
    shutil.copy2(CACHE/"build/dav1d-1.5.3/COPYING",notices/"DAV1D-COPYING.txt")
    source_root=ROOT/".cache/redistribution-sources";source_root.mkdir(parents=True,exist_ok=True)
    sources=[]
    for name in ["ffmpeg","x264","dav1d","compiler_sources"]:
        record=pin[name];destination=source_root/record["file"]
        shutil.copy2(paths[name],destination);sources.append({**record,"bytes":destination.stat().st_size})
    # Preserve the exact effective configuration and recipe with corresponding sources.
    records=source_root/"SavedDesk-media-tools-build-records.zip"
    with zipfile.ZipFile(records,"w",zipfile.ZIP_DEFLATED) as z:
        for p in [ROOT/"packaging/media-tools/build.sh",ROOT/"packaging/media-tools/sources.json",ffmpeg/"config.h",ffmpeg/"ffbuild/config.mak",x264/"config.mak",CACHE/"build/dav1d-1.5.3/build/meson-info/intro-buildoptions.json",signature,key]:
            z.write(p,p.relative_to(ROOT).as_posix())
        z.writestr("SOURCE-SIGNATURE.txt",verified.stdout+verified.stderr)
        z.writestr("CONFIGURATION.txt",configuration)
    sources.append({"file":records.name,"sha256":digest(records),"bytes":records.stat().st_size,"url":"SavedDesk controlled build records"})
    files=[{"path":p.relative_to(output).as_posix(),"sha256":digest(p),"bytes":p.stat().st_size} for p in sorted(output.rglob("*")) if p.is_file() and p!=output/"MEDIA-TOOLS-REVIEW.json"]
    proof={"schema":1,"version":"9.0.2","x264_commit":"c24e06c2e184345ceb33eb20a15d1024d9fd3497","license":"GPL-3.0-or-later","distribution":"Separate command-line programs; no FFmpeg or x264 library is linked into SavedDesk.","source_signature_fingerprint":fingerprint,"source_lock_sha256":digest(ROOT/"packaging/media-tools/sources.json"),"recipe_sha256":digest(ROOT/"packaging/media-tools/build.sh"),"configuration":configuration,"files":files,"sources":sources}
    (output/"MEDIA-TOOLS-REVIEW.json").write_text(json.dumps(proof,indent=2)+"\n")
    licensing=ROOT/"licensing";shutil.copy2(output/"MEDIA-TOOLS-REVIEW.json",licensing/"MEDIA-TOOLS-REVIEW.json")
    (licensing/"media-tools").mkdir(exist_ok=True)
    for p in notices.iterdir():shutil.copy2(p,licensing/"media-tools"/p.name)
    spec=importlib.util.spec_from_file_location("media_audit",ROOT/"packaging/audit-media-tools.py");module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.review()
    print(json.dumps({"passed":True,"files":len(files),"sources":len(sources),"media_tools":str(output)},indent=2))
if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--reuse-build",action="store_true");args=parser.parse_args();build(args.reuse_build)
