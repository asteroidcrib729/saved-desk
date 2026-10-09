"""Download-time and legacy playback copies. Originals are never replaced."""
from pathlib import Path
import os
import re
import shutil
import subprocess
import sys
import uuid
from .models import MediaFailure
from .tools import find_tool


def prepare_playback(root: Path, relative: str, output: str, force: bool = False) -> bool:
    root = root.resolve(strict=True)
    if not root.is_dir() or not isinstance(relative, str) or not isinstance(output, str) or type(force) is not bool:
        raise ValueError("Invalid playback request.")
    if Path(relative).is_absolute() or Path(output).is_absolute():
        raise ValueError("Playback paths must be relative.")
    source = (root / relative).resolve(strict=True)
    destination = root / output
    if not source.is_relative_to(root) or not source.is_file() or source.suffix.lower() not in {".mp4", ".mkv", ".webm"}:
        raise ValueError("Playback source must be a video inside the selected folder.")
    directory = source.parent / ".playback"
    if destination.parent.resolve() != directory.resolve() or not (re.fullmatch(r"[0-9]+-[0-9]+-[0-9]+\.mp4", destination.name) or destination.name == download_cache(source).name):
        raise ValueError("Invalid playback destination.")
    if directory.resolve() != directory.absolute() or destination.is_symlink():
        raise ValueError("Playback cache links are not permitted.")
    encoder = find_tool("ffmpeg")
    if not encoder:
        raise MediaFailure("Video compatibility needs FFmpeg. Repair the app installation.")
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    def run(args, timeout):
        return subprocess.run([encoder, "-nostdin", *args], capture_output=True, timeout=timeout, creationflags=flags)
    temporary = directory / (uuid.uuid4().hex + ".partial.mp4")
    try:
        info = run(["-hide_banner", "-i", str(source)], 30).stderr.decode("utf-8", "replace")
        video = next((line for line in info.splitlines() if "Video:" in line), "")
        if not video:
            raise MediaFailure("This file has no readable video stream. The original is preserved.")
        # Container extensions do not identify the actual video codec or pixel format.
        copy_video, copy_audio = stream_copy_options(info)
        compatible = source.suffix.lower() == ".mp4" and copy_video and copy_audio
        if not force and compatible:
            return False
        if destination.exists():
            raise MediaFailure("A playback copy already exists. Reopen this post to reuse it.")
        if shutil.disk_usage(source.parent).free < 256 * 1024 * 1024:
            raise MediaFailure("Free some disk space before preparing playback. The original is preserved.")
        directory.mkdir(exist_ok=True)
        # H.264 in another container only needs packet copying, not video encoding.
        video_args = ["-c:v", "copy"] if copy_video and not force else [
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-threads", "1", "-filter_threads", "1",
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709", "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709"]
        audio_args = ["-c:a", "copy"] if copy_audio else ["-c:a", "aac", "-profile:a", "aac_low", "-b:a", "128k"]
        result = run(["-hide_banner", "-loglevel", "error", "-n", "-i", str(source), "-map", "0:v:0", "-map", "0:a:0?",
            *video_args, *audio_args, "-movflags", "+faststart", str(temporary)], 1800)
        if result.returncode or not temporary.is_file() or not temporary.stat().st_size:
            raise MediaFailure("A playable copy could not be created. The original is preserved; try Open with Windows.")
        check = run(["-v", "error", "-i", str(temporary), "-t", "15", "-f", "null", "-"], 60)
        if check.returncode:
            raise MediaFailure("The playback copy failed verification. The original is preserved.")
        os.rename(temporary, destination)
        return True
    except (OSError, subprocess.TimeoutExpired):
        raise MediaFailure("Playback preparation could not finish. The original is preserved; try again or Open with Windows.") from None
    finally:
        temporary.unlink(missing_ok=True)

def download_cache(source: Path) -> Path:
    """Identity is independent of catalog IDs and invalidates when source changes."""
    stat = source.stat()
    return source.parent / ".playback" / f"{source.name}-{stat.st_size}-{stat.st_mtime_ns}.mp4"


def prepare_download_video(source: Path) -> Path:
    """Compatibility wrapper: downloads now retain their final MP4 only."""
    from .video import process_video
    from .models import VideoSettings
    return process_video(source, VideoSettings())


def stream_copy_options(info: str) -> tuple[bool, bool]:
    video = next((line for line in info.splitlines() if "Video:" in line), "")
    audio = next((line for line in info.splitlines() if "Audio:" in line), "")
    profile = re.search(r"Video: h264 \(([^)]+)\)", video)
    safe_video = bool(profile and profile[1] in {"Constrained Baseline", "Baseline", "Main", "High"} and re.search(r"\byuv420p(?=[(,\s])", video) and "reserved" not in video)
    return safe_video, not audio or "Audio: aac (LC)" in audio
