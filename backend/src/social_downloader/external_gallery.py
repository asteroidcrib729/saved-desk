"""User-installed gallery runtime. No gallery-dl code enters the frozen worker."""
import json
import os
from pathlib import Path
import subprocess
import sys
from functools import lru_cache
from .models import MAX_FRAME_BYTES, MediaFailure

ALLOWED = {"started", "heartbeat", "item_decision_required", "item_skipped",
           "item_failed", "download_progress", "item_completed", "completed", "failed", "cancelled", "account_verified", "browser_session"}

def required(command):
    source = command.get("source")
    return source in ("instagram", "x", "pinterest") or (
        source == "tiktok" and "/photo/" in command.get("target", ""))

def python_path():
    configured = os.environ.get("SAVEDDESK_GALLERY_PYTHON", "")
    if configured:
        path = Path(configured)
        if path.is_absolute() and path.is_file():
            return str(path.resolve())
        return None
    return None if getattr(sys, "frozen", False) else sys.executable

@lru_cache(maxsize=8)
def _probe(path, fingerprint):
    code = ("import json,importlib.metadata as m;"
            "print(json.dumps({n:m.version(n) for n in ['gallery-dl','requests','yt-dlp']}))")
    try:
        p = subprocess.run([path, "-I", "-c", code], capture_output=True, timeout=8,
                           creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0)
        if p.returncode or len(p.stdout)>8192:
            return False
        versions=json.loads(p.stdout)
        return versions == {"gallery-dl":"1.32.14","requests":"2.34.2","yt-dlp":"2026.8.19"}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return False

def available():
    path=python_path()
    if not path:return False
    try:
        info=Path(path).stat()
        return _probe(path,(info.st_size,info.st_mtime_ns))
    except OSError:return False

def adapter_script():
    if getattr(sys,"frozen",False):
        return Path(sys._MEIPASS)/"external-adapter"/"entry.py"
    return Path(__file__).resolve().parents[3]/"packaging"/"external-adapter"/"entry.py"

def execute(worker,command):
    path=python_path()
    if not path or not available():
        raise MediaFailure("Gallery tools are not configured. In Settings, select a separate Python environment with the supported gallery-dl packages, then Check setup. Your saved files are preserved.")
    script=adapter_script()
    if not script.is_file():
        raise MediaFailure("The gallery adapter is missing. Repair SavedDesk; your saved files are preserved.")
    env=dict(os.environ)
    env["SAVEDDESK_EXTERNAL_ADAPTER"]="1"
    # Node remains the app's standalone permissively licensed extraction runtime.
    from .tools import javascript_runtime
    runtime=javascript_runtime()
    if runtime:env["SAVEDDESK_NODE"]=runtime
    process=None
    try:
        process=subprocess.Popen([path,"-I","-B","-u",str(script)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,text=True,encoding="utf-8",env=env,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0)
        def send(value):
            process.stdin.write(json.dumps(value,ensure_ascii=True,separators=(",",":"))+"\n")
            process.stdin.flush()
        def receive():
            raw=process.stdout.readline(MAX_FRAME_BYTES+2)
            if not raw or not raw.endswith("\n") or len(raw.encode("utf-8"))>MAX_FRAME_BYTES:
                raise MediaFailure("The separate gallery engine stopped or returned an invalid response. Your saved files are preserved.")
            value=json.loads(raw)
            if not isinstance(value,dict) or value.get("protocol_version")!=1 or type(value.get("sequence")) is not int:
                raise MediaFailure("The separate gallery engine returned an invalid response.")
            return value
        hello=receive()
        if hello.get("event")!="hello" or hello["sequence"]!=1:
            raise MediaFailure("The separate gallery engine could not start.")
        previous=hello["sequence"]
        send(command)
        while True:
            event=receive()
            if event["sequence"]<=previous or event.get("job_id")!=command.get("job_id") or event.get("event") not in ALLOWED or not isinstance(event.get("data"),dict):
                raise MediaFailure("The separate gallery engine returned an invalid job response.")
            previous=event["sequence"]
            # Rewrite sequence numbers through the supervising worker; preserve Rust approval/ack ordering.
            worker.emit(event["event"],event["job_id"],**event["data"])
            if event["event"] in ("completed","failed","cancelled","account_verified","browser_session"):
                break
            if event["event"] in ("item_decision_required","item_completed"):
                reply=worker.read()
                if not reply:raise MediaFailure("Gallery download cancelled because its host closed.")
                expected="item_decision" if event["event"]=="item_decision_required" else "item_recorded"
                if reply.get("command")!=expected or reply.get("job_id")!=command["job_id"] or reply.get("item_id")!=event["data"].get("item_id"):
                    raise MediaFailure("A scoped gallery decision or acknowledgement is required.")
                send(reply)
        if event["event"] not in ("failed","cancelled") and process.poll() is None:
            send({"protocol_version":1,"command":"shutdown"})
        try:process.wait(timeout=5)
        except subprocess.TimeoutExpired:process.kill();process.wait()
        return event["event"] not in ("failed","cancelled")
    except MediaFailure:
        raise
    except (OSError, ValueError, BrokenPipeError):
        raise MediaFailure("The separate gallery engine could not finish. Check its setup in Settings. Your saved files are preserved.") from None
    finally:
        if process:
            if process.poll() is None:process.kill();process.wait()
            if process.stdin:process.stdin.close()
            if process.stdout:process.stdout.close()
