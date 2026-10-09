"""Keep one verified H.264/AAC MP4 per download, with compatible streams copied."""
from pathlib import Path
from functools import lru_cache
import os
import re
import shutil
import subprocess
import sys
import uuid

from .tools import find_tool, inspect_media
from .models import MediaFailure, VideoSettings


class UnreadableVideo(MediaFailure):
    """Unrecorded input has no readable video stream; the adapter must fetch fresh bytes."""


SOFTWARE_ENCODING = ["-c:v", "libx264", "-preset", "superfast", "-crf", "23", "-threads", "2"]
HARDWARE_ENCODING = (
    ("h264_qsv", ["-c:v", "h264_qsv", "-preset", "veryfast", "-global_quality", "23"]),
    ("h264_nvenc", ["-c:v", "h264_nvenc", "-preset", "p1", "-rc", "vbr", "-cq", "23", "-b:v", "0"]),
    ("h264_amf", ["-c:v", "h264_amf", "-quality", "speed", "-rc", "cqp", "-qp_i", "23", "-qp_p", "23"]),
)


def _run(encoder, args, timeout):
    return subprocess.run([encoder, "-nostdin", "-protocol_whitelist", "file,pipe", *args], capture_output=True, timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)


@lru_cache(maxsize=4)
def hardware_encoding(encoder):
    """Encoder presence is insufficient: test actual device initialization once."""
    for _, args in HARDWARE_ENCODING:
        try:
            result = _run(encoder, ["-v", "error", "-f", "lavfi", "-i", "color=s=128x128:r=24",
                "-frames:v", "2", *args, "-pix_fmt", "yuv420p", "-f", "null", "-"], 3)
            if result.returncode == 0:
                return tuple(args)
        except (OSError, subprocess.TimeoutExpired):
            continue
    return None


def process_video(source: Path, settings: VideoSettings) -> Path:
    """Finalize only after decode verification; failed work keeps its retry source."""
    if source.is_symlink() or not source.is_file() or source.suffix.lower() not in {".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi"}:
        raise MediaFailure("The downloaded video is not a regular supported file.")
    encoder = find_tool("ffmpeg")
    if not encoder:
        raise MediaFailure("Video compatibility needs FFmpeg. Select a working FFmpeg executable in Settings > Download tools.")
    temporary = source.with_name(f".{source.stem}.{uuid.uuid4().hex}.partial.mp4")
    try:
        info = _run(encoder, ["-hide_banner", "-i", str(source)], 30).stderr.decode("utf-8", "replace")
        dimensions = re.search(r"Video:.*?\b(\d{2,5})x(\d{2,5})\b", info)
        if not dimensions:
            raise UnreadableVideo("This file has no readable video stream. Retry will download this item again. Completed files are preserved.")
        height = int(dimensions[2])
        resize = bool(settings.resolution and height > settings.resolution)
        if resize and settings.profile == "original":
            raise MediaFailure("No source stream meets this resolution. Choose MP4 with resize fallback to allow resizing.")
        from .playback import stream_copy_options
        copy_video, copy_audio = stream_copy_options(info)
        if source.suffix.lower() == ".mp4" and copy_video and copy_audio and not resize:
            return source  # No conversion or second file for an already playable stream.
        destination = source if source.suffix.lower() == ".mp4" else source.with_suffix(".mp4")
        if destination != source and destination.exists():
            # Never replace a different saved file merely because its stem matches.
            destination = source.with_name(source.stem + ".compatible-" + uuid.uuid4().hex + ".mp4")
        if destination.is_symlink():
            raise MediaFailure("Linked video destinations are not permitted.")
        if shutil.disk_usage(source.parent).free < 256 * 1024 * 1024:
            raise MediaFailure("Free some disk space before finalizing this video. The unfinished download is kept for retry.")
        transcode = not copy_video or resize
        acceleration = hardware_encoding(encoder) if transcode and settings.encoder == "auto" else None
        software = ["-c:v", "libx264", "-preset", settings.preset, "-crf", str(settings.crf), "-threads", "2"]
        attempts = [list(acceleration), software] if acceleration else [software]
        if not transcode:
            attempts = [["-c:v", "copy"]]
        audio_args = ["-c:a", "copy"] if copy_audio else ["-c:a", "aac", "-profile:a", "aac_low", "-b:a", f"{settings.audio_bitrate}k"]
        for video_args in attempts:
            temporary.unlink(missing_ok=True)
            command = ["-hide_banner", "-loglevel", "error", "-n", "-threads", "2", "-i", str(source),
                "-map", "0:v:0", "-map", "0:a:0?", *video_args, *audio_args, "-movflags", "+faststart"]
            if transcode:
                scale = f"scale=-2:trunc(min(ih\\,{settings.resolution})/2)*2" if resize else "scale=trunc(iw/2)*2:trunc(ih/2)*2"
                command += ["-filter_threads", "1", "-vf", scale + ",format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709", "-pix_fmt", "yuv420p",
                    "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709"]
            try:
                result = _run(encoder, command + [str(temporary)], 21600)
                if result.returncode or not temporary.is_file() or not temporary.stat().st_size:
                    continue  # A device can pass the small probe but reject the real input.
                # One bounded invocation checks the actual output codec AND decodes frames.
                # The full source was just encoded/remuxed; replaying 15 seconds here adds
                # needless serial CPU work to every item in a collection.
                checked = _run(encoder, ["-hide_banner", "-loglevel", "info", "-xerror", "-threads", "2", "-i", str(temporary),
                    "-map", "0:v:0", "-map", "0:a:0?", "-t", "0.25", "-frames:v", "3", "-f", "null", "-"], 60)
            except subprocess.TimeoutExpired:
                continue  # A hung hardware attempt can still fall back to software.
            output_info = checked.stderr.decode("utf-8", "replace")
            decoded = any(int(value)>0 for value in re.findall(r"frame=\s*(\d+)", output_info))
            if checked.returncode or not decoded or not all(stream_copy_options(output_info)):
                continue
            if destination == source:
                os.replace(temporary, source)  # Atomic replacement of this unrecorded download.
            else:
                os.rename(temporary, destination)
                try:
                    source.unlink()
                except OSError:
                    destination.unlink(missing_ok=True)
                    raise
            return destination
        raise MediaFailure("A playable MP4 could not be verified. The unfinished download is kept for retry.")
    except (OSError, subprocess.TimeoutExpired):
        raise MediaFailure("Video finalization could not finish. The unfinished download is kept for retry.") from None
    finally:
        temporary.unlink(missing_ok=True)


def encode_fixture(destination: Path) -> dict:
    encoder = find_tool("ffmpeg")
    if not encoder:
        raise ValueError("A working FFmpeg build is required for the video test.")
    destination = destination.resolve()
    if destination.exists():
        raise ValueError("The video test never overwrites an existing file.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.stem}.{uuid.uuid4().hex}.partial.mp4")
    command = [encoder, "-nostdin", "-hide_banner", "-loglevel", "error", "-n",
               "-f", "lavfi", "-i", "color=c=0x26c6b1:s=1280x720:r=24:d=2",
               "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "2",
               "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-threads", "1",
               "-filter_threads", "1", "-filter_complex_threads", "1",
               "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
               "-movflags", "+faststart", str(temporary)]
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    try:
        result = subprocess.run(command, capture_output=True, timeout=30, creationflags=flags)
        if result.returncode or not temporary.is_file() or temporary.stat().st_size == 0:
            raise ValueError("The H.264 video test failed. No existing media was changed.")
        # Decode the full bounded fixture; an output's existence alone is insufficient.
        verification = subprocess.run([encoder, "-nostdin", "-v", "error", "-i", str(temporary),
                                       "-map", "0:v:0", "-map", "0:a:0", "-t", "2", "-f", "null", "-"],
                                      capture_output=True, timeout=15, creationflags=flags)
        if verification.returncode:
            raise ValueError("The encoded fixture could not be decoded.")
        streams = inspect_media(temporary)
        if streams is not None and not any(stream.get("codec_name") == "h264" for stream in streams["streams"]):
            raise ValueError("The fixture is not H.264.")
        os.rename(temporary, destination)
        return {"bytes": destination.stat().st_size, "width": 1280, "height": 720,
                "seconds": 2, "codec": "h264", "threads": 1, "decoded": True,
                "ffprobe_verified": streams is not None}
    finally:
        temporary.unlink(missing_ok=True)
