"""Consent-based, hash-pinned user installation; no gallery code is redistributed."""
from pathlib import Path, PurePosixPath
import hashlib
import http.client
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from .models import MediaFailure

HOSTS = {"www.python.org", "files.pythonhosted.org"}
MAX_EXPANDED = 256 * 1024 * 1024

def setup_lock():
    path = (Path(sys._MEIPASS) / "setup/gallery-tools-lock.json" if getattr(sys, "frozen", False)
            else Path(__file__).resolve().parents[3] / "packaging/gallery-tools-lock.json")
    return json.loads(path.read_text(encoding="utf-8"))

def safe_directory(path):
    path = Path(path)
    if not path.is_absolute():
        raise MediaFailure("The download tools folder must be absolute.")
    for parent in reversed([path, *path.parents]):
        if parent.exists():
            value = parent.lstat()
            if parent.is_symlink() or getattr(value, "st_file_attributes", 0) & 0x400 or not parent.is_dir():
                raise MediaFailure("Linked or invalid download tools folders are not supported.")
    path.mkdir(parents=True, exist_ok=True)
    return path

def fetch(record, destination, progress):
    address = urllib.parse.urlsplit(record["url"])
    if address.scheme != "https" or address.hostname not in HOSTS or address.username or address.password:
        raise MediaFailure("The download tools source is not approved.")
    if not re.fullmatch(r"[a-f0-9]{64}", record["sha256"]) or not 0 < record["bytes"] < 100 * 1024 * 1024:
        raise MediaFailure("The download tools manifest is invalid.")
    network_message = "Download tools could not be obtained. Check your connection and try again. Existing settings were preserved."
    # Only this call's newly created staging file may be reset on a retry.
    # Integrity/source failures are never retried or accepted.
    with destination.open("xb") as output:
        for attempt in range(3):
            digest = hashlib.sha256()
            received = 0
            output.seek(0)
            output.truncate()
            try:
                with urllib.request.urlopen(record["url"], timeout=30) as response:
                    redirected = urllib.parse.urlsplit(response.geturl())
                    if redirected.scheme != "https" or redirected.hostname not in HOSTS:
                        raise MediaFailure("The download tools source redirected to an unapproved host.")
                    while chunk := response.read(64 * 1024):
                        received += len(chunk)
                        if received > record["bytes"]:
                            raise MediaFailure("The download tools archive is larger than expected.")
                        digest.update(chunk)
                        output.write(chunk)
                        progress(received, record["bytes"])
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.IncompleteRead) as error:
                retryable = not isinstance(error, urllib.error.HTTPError) or error.code in (408, 429, 500, 502, 503, 504)
                if isinstance(error, urllib.error.HTTPError):
                    error.close()
                if not retryable or attempt == 2:
                    raise MediaFailure(network_message) from error
                progress(0, record["bytes"])
                time.sleep(2 ** attempt)
                continue
            except OSError as error:
                raise MediaFailure(network_message) from error
            if received != record["bytes"] or digest.hexdigest() != record["sha256"]:
                raise MediaFailure("Download tools verification failed. No unverified software was installed.")
            return

def extract(archive, destination):
    """Extract only regular, unique ZIP files into a new, owned directory."""
    destination = Path(destination)
    total = 0
    seen = set()
    with zipfile.ZipFile(archive) as entries:
        for entry in entries.infolist():
            name = PurePosixPath(entry.orig_filename)
            key = entry.orig_filename.casefold()
            mode = entry.external_attr >> 16
            total += entry.file_size
            if (name.is_absolute() or ".." in name.parts or chr(92) in entry.orig_filename or ":" in entry.orig_filename
                    or key in seen or stat.S_ISLNK(mode) or total > MAX_EXPANDED
                    or mode and stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
                raise MediaFailure("The download tools archive contains an unsafe entry.")
            seen.add(key)
            target = destination.joinpath(*name.parts)
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with entries.open(entry) as source, target.open("xb") as output:
                shutil.copyfileobj(source, output)

def validate(python, lock):
    expected = {p["name"]: p["version"] for p in lock["packages"]}
    code = "import json,importlib.metadata as m;print(json.dumps({n:m.version(n) for n in " + repr(list(expected)) + "}))"
    result = subprocess.run([str(python), "-I", "-B", "-c", code], capture_output=True, timeout=25,
                            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    if result.returncode or len(result.stdout) > 8192 or json.loads(result.stdout) != expected:
        raise MediaFailure("The new gallery tools did not pass their startup check. Existing settings were preserved.")

def install(data, emit, lock=None):
    lock = lock or setup_lock()
    base = safe_directory(Path(data) / "tools")
    fingerprint = hashlib.sha256(json.dumps(lock, sort_keys=True).encode()).hexdigest()
    final = base / ("gallery-" + fingerprint[:16])
    if final.exists():
        safe_directory(final)
        proof = json.loads((final / "installation.json").read_text())
        if proof.get("manifest_sha256") != fingerprint:
            raise MediaFailure("Existing gallery tools differ from the reviewed installation.")
        for record in proof["files"]:
            path = final / record["path"]
            if not path.resolve().is_relative_to(final.resolve()) or path.is_symlink() or not path.is_file():
                raise MediaFailure("Existing gallery tools are incomplete.")
            with path.open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != record["sha256"]:
                    raise MediaFailure("Existing gallery tools have changed. Select another environment or repair this installation.")
        validate(final / "python.exe", lock)
        return str(final / "python.exe")
    stage = Path(tempfile.mkdtemp(prefix="gallery-install-", dir=base))
    try:
        archives = stage / "archives"
        archives.mkdir()
        runtime = stage / "runtime"
        runtime.mkdir()
        records = [lock["runtime"], *lock["packages"]]
        for index, record in enumerate(records):
            name = record["file"]
            if Path(name).name != name or "/" in name or chr(92) in name:
                raise MediaFailure("Invalid download tools archive name.")
            emit(f"Downloading and verifying {record.get('name', 'Python runtime')}", index, len(records))
            fetch(record, archives / name, lambda received, total:
                  emit(f"Downloading {record.get('name', 'Python runtime')}", index, len(records), received, total))
            extract(archives / name, runtime if index == 0 else runtime / "Lib/site-packages")
        pth = runtime / "python314._pth"
        pth.write_text("python314.zip\n.\nLib/site-packages\nimport site\n", encoding="ascii")
        emit("Checking the separate gallery environment", len(records), len(records))
        validate(runtime / "python.exe", lock)
        inventory = []
        for path in sorted(runtime.rglob("*")):
            if path.is_file():
                with path.open("rb") as stream:
                    inventory.append({"path": path.relative_to(runtime).as_posix(), "sha256": hashlib.file_digest(stream, "sha256").hexdigest()})
        (runtime / "installation.json").write_text(json.dumps({"manifest_sha256": fingerprint, "files": inventory}, indent=2))
        runtime.rename(final)
        return str(final / "python.exe")
    finally:
        # Only the newly created staging tree belongs to this operation.
        if stage.parent == base and not stage.is_symlink():
            shutil.rmtree(stage, ignore_errors=True)
