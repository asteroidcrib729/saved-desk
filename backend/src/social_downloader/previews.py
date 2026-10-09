"""Small first-frame previews produced serially during an approved download."""
from pathlib import Path
import subprocess
import sys
import uuid

from .tools import find_tool


def make_preview(source: Path) -> None:
    if source.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".mp4", ".mkv", ".webm"}:
        return
    directory = source.parent / ".previews"
    destination = directory / (source.name + ".jpg")
    temporary = directory / (uuid.uuid4().hex + ".jpg")
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    try:
        if directory.resolve().parent != source.parent.resolve() or destination.is_symlink():
            return
        if destination.is_file() and 0 < destination.stat().st_size <= 65536 and destination.stat().st_mtime_ns >= source.stat().st_mtime_ns:
            with destination.open("rb") as cached:
                if cached.read(3)==b"\xff\xd8\xff":return
        encoder = find_tool("ffmpeg")
        if not encoder:
            return
        directory.mkdir(exist_ok=True)
        result = subprocess.run(
            [encoder, "-nostdin", "-hide_banner", "-loglevel", "error", "-n", "-protocol_whitelist", "file,pipe", "-i", str(source),
             "-map", "0:v:0", "-frames:v", "1", "-vf", "scale=320:240:force_original_aspect_ratio=decrease",
             "-threads", "1", "-filter_threads", "1", "-q:v", "5", str(temporary)],
            capture_output=True, timeout=15, creationflags=flags,
        )
        if result.returncode == 0 and temporary.is_file() and 0 < temporary.stat().st_size <= 65536:
            temporary.replace(destination)
    except (OSError, subprocess.TimeoutExpired):
        pass
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
