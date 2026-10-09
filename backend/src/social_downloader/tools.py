"""Resolve real executables; a name in PATH is not proof that a tool works."""

from pathlib import Path
from functools import lru_cache
import json
import os
import shutil
import subprocess
import sys


def _check(candidate: str | Path | None) -> str | None:
    if not candidate:
        return None
    try:
        result = subprocess.run([str(candidate), "-version"], capture_output=True, timeout=5,
                                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        if result.returncode == 0:
            return str(Path(candidate).resolve())
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None


@lru_cache(maxsize=16)
def _validated(path: str, fingerprint: tuple) -> str | None:
    # Process-local decisions only. A replaced/updated binary is always checked again.
    return _check(path)


def _valid(candidate: str | Path | None) -> str | None:
    if not candidate:
        return None
    try:
        path=Path(candidate).resolve(strict=True)
        stat=path.stat()
        if not path.is_file():return None
        return _validated(str(path),(stat.st_size,stat.st_mtime_ns,stat.st_ctime_ns,stat.st_ino))
    except OSError:
        # Preserve executable/alias fallback behavior without caching missing paths.
        return _check(candidate)


def find_tool(name: str, tools_dir: Path | None = None) -> str | None:
    candidates = []
    configured=os.environ.get("SAVEDDESK_FFMPEG", "")
    if configured:
        selected=Path(configured)
        if selected.is_absolute():
            candidates.append(selected if name=="ffmpeg" else selected.with_name("ffprobe.exe" if sys.platform=="win32" else "ffprobe"))
    if tools_dir:
        candidates.append(tools_dir / (name + (".exe" if sys.platform == "win32" else "")))
    candidates.append(shutil.which(name))
    if name == "ffmpeg" and not getattr(sys,"frozen",False):
        try:
            import imageio_ffmpeg
            candidates.append(imageio_ffmpeg.get_ffmpeg_exe())
        except (ImportError, RuntimeError):
            pass
    for candidate in candidates:
        resolved = _valid(candidate)
        if resolved:
            return resolved
    return None


def inspect_media(path: Path, ffprobe: str | None = None) -> dict | None:
    """Unknown/unreadable files stay unknown; never infer audio-only from byte signatures."""
    probe = ffprobe or find_tool("ffprobe")
    if not probe:
        return None
    try:
        result = subprocess.run([probe, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                                capture_output=True, timeout=15,
                                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        if result.returncode != 0 or len(result.stdout) > 256 * 1024:
            return None
        value = json.loads(result.stdout)
        return value if isinstance(value, dict) and isinstance(value.get("streams"), list) else None
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def javascript_runtime() -> str | None:
    """Use the packaged runtime, with a build-environment fallback only when unfrozen."""
    if os.environ.get("SAVEDDESK_NODE"):
        selected=Path(os.environ["SAVEDDESK_NODE"])
        if selected.is_absolute() and selected.is_file():return str(selected)
    if getattr(sys, "frozen", False):
        candidate = Path(sys._MEIPASS) / "runtime" / "node.exe"
        return str(candidate) if candidate.is_file() else None
    return shutil.which("node")
