"""On-demand worker with private account verification and approved media transfers.

stdout is bounded JSON Lines only. No cookie discovery occurs at startup.
Rust keeps credential-bearing commands/results private from the renderer.
"""

import hashlib
import json
import os
from pathlib import Path
import sys
import uuid
import threading
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, build_opener

from . import __version__
from .models import MAX_FRAME_BYTES, PROTOCOL_VERSION, MediaFailure, contained_path
from .tools import find_tool, javascript_runtime


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fixture_bytes(identity: str, source_url: str | None) -> bytes:
    if source_url is not None:
        # Test fixtures may use an explicit loopback server; never arbitrary websites.
        parts = urlsplit(source_url)
        if parts.scheme != "http" or parts.hostname != "127.0.0.1" or not parts.port or parts.username or parts.password:
            raise ValueError("Only a loopback test fixture is permitted.")
        opener = build_opener(ProxyHandler({}), NoRedirect())
        with opener.open(source_url, timeout=5) as response:
            payload = response.read(65537)
        if not payload or len(payload) > 65536:
            raise ValueError("Invalid fixture size.")
        return payload
    color = {"fixture-1": "#26c6b1", "fixture-2": "#e4b66b", "fixture-3": "#9e99e8"}.get(identity, "#26c6b1")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">'
            f'<rect width="640" height="480" fill="#1b2026"/><circle cx="320" cy="220" r="110" fill="{color}"/>'
            '<text x="320" y="410" text-anchor="middle" font-family="sans-serif" font-size="24" fill="white">SavedDesk test content</text></svg>').encode()


class Worker:
    def __init__(self, incoming, outgoing):
        self.incoming = incoming
        self.outgoing = outgoing
        self.sequence = 0
        self.output_lock = threading.Lock()

    def emit(self, event: str, job_id: str | None = None, **data):
        with self.output_lock:
            self.sequence += 1
            frame = {"protocol_version": PROTOCOL_VERSION, "sequence": self.sequence,
                     "job_id": job_id, "event": event, "data": data}
            encoded = json.dumps(frame, ensure_ascii=True, separators=(",", ":"))
            if len(encoded.encode()) > MAX_FRAME_BYTES:
                raise ValueError("Event is too large.")
            self.outgoing.write(encoded + "\n")
            self.outgoing.flush()

    def read(self) -> dict | None:
        raw = self.incoming.readline(1024 * 1024 + 2)
        if not raw:
            return None
        if len(raw.encode()) > 1024 * 1024 or not raw.endswith("\n"):
            raise ValueError("Invalid frame size.")
        value = json.loads(raw)
        if not isinstance(value, dict) or type(value.get("protocol_version")) is not int or value.get("protocol_version") != PROTOCOL_VERSION:
            raise ValueError("Unsupported protocol version.")
        if not isinstance(value.get("command"), str):
            raise ValueError("Missing command.")
        if len(raw.encode()) > MAX_FRAME_BYTES and value["command"] not in ("verify_account", "live_download"):
            raise ValueError("Invalid frame size.")
        return value

    def fixture(self, command: dict):
        job_id = command.get("job_id")
        root = Path(command["destination"]).resolve()
        if not isinstance(job_id, str) or not job_id or command.get("download_mode") not in ("new_only", "all_again"):
            raise ValueError("Invalid fixture job.")
        items = command.get("items")
        if not isinstance(items, list) or not 1 <= len(items) <= 20:
            raise ValueError("Invalid fixture item count.")
        self.emit("started", job_id)
        for item in items:
            identity = item["id"]
            if identity not in ("fixture-1", "fixture-2", "fixture-3"):
                raise ValueError("Fixture identities only.")
            self.emit("item_decision_required", job_id, item_id=identity)
            decision = self.read()
            if decision and decision.get("command") == "cancel" and decision.get("job_id") == job_id:
                self.emit("cancelled", job_id)
                return
            if not decision or decision.get("command") != "item_decision" or decision.get("item_id") != identity or decision.get("job_id") != job_id:
                raise ValueError("Expected a scoped transfer decision.")
            if type(decision.get("transfer")) is not bool:
                raise ValueError("Transfer approval must be explicit.")
            if not decision.get("transfer"):
                self.emit("item_skipped", job_id, item_id=identity)
                continue
            filename = identity + ".svg"
            path = contained_path(root, filename)
            if path.exists():
                raise ValueError("The approved output already exists.")
            root.mkdir(parents=True, exist_ok=True)
            payload = fixture_bytes(identity, item.get("url"))
            partial = contained_path(root, f".{filename}.{uuid.uuid4().hex}.partial")
            try:
                with partial.open("xb") as stream:
                    stream.write(payload)
                    stream.flush()
                    os.fsync(stream.fileno())
                # os.rename on Windows refuses replacement of an existing destination.
                if path.exists():
                    raise ValueError("Output collision.")
                os.rename(partial, path)
            finally:
                partial.unlink(missing_ok=True)
            self.emit("item_completed", job_id, item_id=identity, relative_path=filename,
                      bytes_written=len(payload), sha256=hashlib.sha256(payload).hexdigest())
            ack = self.read()
            if not ack or ack.get("command") != "item_recorded" or ack.get("item_id") != identity or ack.get("job_id") != job_id:
                raise ValueError("Catalog acknowledgement is required.")
        self.emit("completed", job_id)

    def run(self):
        self.emit("hello", worker_version=__version__, capabilities=["fixture_download", "probe_capabilities", "verify_account", "live_download"])
        while True:
            command = None
            try:
                command = self.read()
                if command is None or command["command"] == "shutdown":
                    return 0
                if command["command"] == "probe_capabilities":
                    from .platforms import PUBLIC_SOURCES
                    import importlib.util
                    from .external_gallery import available as gallery_available
                    self.emit("capabilities", gallery=gallery_available(), youtube_runtime=bool(javascript_runtime() and importlib.util.find_spec("yt_dlp_ejs")), public_platforms=list(PUBLIC_SOURCES), ffmpeg=bool(find_tool("ffmpeg")), ffprobe=bool(find_tool("ffprobe")),
                              live_downloads=True, browser_connection=True)
                elif command["command"] == "fixture_download":
                    self.fixture(command)
                elif command["command"] == "approve_browser_session":
                    from .browser_sessions import approve_session
                    self.emit("browser_session_ready", **approve_session(command["source"], command["cookies"]))
                elif command["command"] == "verify_account":
                    from .authentication import verify_account
                    if getattr(sys,"frozen",False):
                        from .external_gallery import execute as external_execute
                        if not external_execute(self,command):return 1
                    else:
                        self.emit("account_verified", **verify_account(command["source"], command["cookies"], test_origin=command.get("test_origin"), user_agent=command.get("user_agent")))
                elif command["command"] == "firefox_profiles":
                    from .firefox import discover
                    self.emit("browser_profiles", profiles=discover(command.get("test_profile_root")))
                elif command["command"] == "firefox_connect":
                    from .firefox import connect
                    # This result is private to Rust and is never emitted to the webview.
                    if getattr(sys,"frozen",False):
                        from .external_gallery import execute as external_execute
                        if not external_execute(self,command):return 1
                    else:
                        self.emit("browser_session", **connect(command["source"], command["profile_id"], root=command.get("test_profile_root"), test_origin=command.get("test_origin")))
                elif command["command"] == "prepare_playback":
                    from .playback import prepare_playback
                    stopped = threading.Event()
                    def playback_pulse():
                        while not stopped.wait(5):
                            self.emit("playback_heartbeat")
                    pulse = threading.Thread(target=playback_pulse, daemon=True)
                    pulse.start()
                    try:
                        converted = prepare_playback(Path(command["destination"]), command["relative"], command["output"], command.get("force", False))
                    finally:
                        stopped.set()
                        pulse.join(timeout=1)
                    self.emit("playback_ready", converted=converted)
                elif command["command"] == "generate_previews":
                    from .previews import make_preview
                    root = Path(command["destination"]).resolve(strict=True)
                    files = command.get("files")
                    if not root.is_dir() or not isinstance(files, list) or not 1 <= len(files) <= 18:
                        raise ValueError("Invalid preview request.")
                    paths = []
                    for relative in files:
                        if not isinstance(relative, str) or Path(relative).is_absolute():
                            raise ValueError("Relative preview paths are required.")
                        path = (root / relative).resolve(strict=True)
                        if not path.is_relative_to(root) or not path.is_file():
                            raise ValueError("Preview files must stay in the selected folder.")
                        paths.append(path)
                    for path in paths:
                        make_preview(path)
                        self.emit("preview_progress")
                    self.emit("previews_completed")
                elif command["command"] == "live_download":
                    from .live import execute
                    stopped = threading.Event()
                    def heartbeat():
                        while not stopped.wait(5):
                            self.emit("heartbeat", command["job_id"])
                    pulse = threading.Thread(target=heartbeat, daemon=True)
                    pulse.start()
                    try:
                        from .external_gallery import required, execute as external_execute
                        if required(command) and getattr(sys,"frozen",False):
                            if not external_execute(self,command):return 1
                        else:
                            execute(self, command)
                    finally:
                        stopped.set()
                        pulse.join(timeout=1)
                else:
                    self.emit("failed", command.get("job_id"), category="unsupported_command",
                              message="This capability is not implemented in the prototype.")
            except Exception as failure:
                from .authentication import ConnectionFailure
                message = str(failure) if isinstance(failure, (ConnectionFailure, MediaFailure)) else "The platform download could not finish. Your saved files are preserved. Check the connection, sign in again in your browser, and retry."
                category = "processing" if isinstance(failure, MediaFailure) else "connection" if isinstance(failure, ConnectionFailure) else "download" if isinstance(command, dict) and command.get("command") == "live_download" else "invalid_request"
                self.emit("failed", command.get("job_id") if isinstance(command, dict) else None, category=category, message=message)
                return 1


def main():
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    return Worker(sys.stdin, sys.stdout).run()


if __name__ == "__main__":
    raise SystemExit(main())
