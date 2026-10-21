"""Check the actual frozen executable, not just its adjacent inventory metadata."""
import argparse,json,os,subprocess
from pathlib import Path

def check(worker:Path,expected:str)->dict:
    result=subprocess.run([str(worker.resolve())],input="",capture_output=True,text=True,encoding="utf-8",timeout=20,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=="nt" else 0)
    if result.returncode:raise ValueError("Packaged worker failed its empty-input startup check")
    try:hello=json.loads(result.stdout.splitlines()[0])
    except (IndexError,ValueError) as error:raise ValueError("Packaged worker did not emit a valid greeting") from error
    if hello.get("protocol_version")!=1 or hello.get("event")!="hello" or hello.get("data",{}).get("worker_version")!=expected:
        raise ValueError("The frozen worker version differs from this source checkout")
    return {"passed":True,"worker_version":expected,"startup_without_account_or_download_request":True}

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("worker",type=Path);args=parser.parse_args()
    version=json.loads((Path(__file__).resolve().parents[1]/"desktop/package.json").read_text())["version"]
    print(json.dumps(check(args.worker,version)))
