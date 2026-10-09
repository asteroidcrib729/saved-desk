"""Validate the worker boundary before touching the filesystem or tools."""

from dataclasses import dataclass
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit


class MediaFailure(ValueError):
    """A controlled processing message that is safe to show to the user."""

PROTOCOL_VERSION = 1
MAX_FRAME_BYTES = 256 * 1024
RESOLUTIONS = (360, 480, 720, 1080, 1440, 2160)


def canonical_target(source: str, value: str) -> str:
    from .platforms import PUBLIC_SOURCES, canonical_public
    if source in PUBLIC_SOURCES:
        return canonical_public(source, value)
    parts = urlsplit(value.strip())
    if parts.scheme != "https" or parts.username or parts.password or parts.port:
        raise ValueError("Use an HTTPS Instagram or X link.")
    if source == "instagram" and parts.hostname in ("instagram.com", "www.instagram.com"):
        path = parts.path.rstrip("/") + "/"
        if path.startswith("/reels/"):
            path = "/reel/" + path[len("/reels/"):]
        if not re.fullmatch(r"/(?:p|reel)/[A-Za-z0-9_-]+/|/[A-Za-z0-9._]+/saved/(?:all-posts/|[A-Za-z0-9_%.-]+/[0-9]+/)?", path):
            raise ValueError("Choose an Instagram saved collection or post.")
        return urlunsplit(("https", "www.instagram.com", path, "", ""))
    if source == "x" and parts.hostname in ("x.com", "www.x.com", "twitter.com", "www.twitter.com"):
        path = parts.path.rstrip("/")
        if path != "/i/bookmarks" and not re.fullmatch(r"/[A-Za-z0-9_]+/status/[0-9]+", path):
            raise ValueError("Choose X bookmarks or a post.")
        return urlunsplit(("https", "x.com", path, "", ""))
    raise ValueError("This link does not match the selected platform.")


def contained_path(root: Path, relative: str) -> Path:
    candidate = (root / relative).resolve()
    if not relative or candidate == root.resolve() or not candidate.is_relative_to(root.resolve()):
        raise ValueError("File path is outside the approved folder.")
    return candidate


@dataclass(frozen=True)
class VideoSettings:
    resolution: int | None = None
    profile: str = "original"
    encoder: str = "auto"
    preset: str = "superfast"
    crf: int = 23
    audio_bitrate: int = 128

    @classmethod
    def from_command(cls, command):
        advanced = command.get("advanced", {})
        if not isinstance(advanced, dict) or set(advanced) - {"encoder", "preset", "crf", "audioBitrate"}:
            raise ValueError("Choose supported advanced video settings.")
        return cls(command.get("resolution"), command.get("profile", "original"),
                   advanced.get("encoder", "auto"), advanced.get("preset", "superfast"),
                   advanced.get("crf", 23), advanced.get("audioBitrate", 128))

    def __post_init__(self):
        if self.resolution is not None and (type(self.resolution) is not int or self.resolution not in RESOLUTIONS):
            raise ValueError("Choose a supported video resolution.")
        if self.profile not in ("original", "compatible_mp4"):
            raise ValueError("Choose a supported video profile.")
        if self.encoder not in ("auto", "software") or self.preset not in ("superfast", "fast", "slow"):
            raise ValueError("Choose a supported video encoder and speed.")
        if type(self.crf) is not int or self.crf not in (18, 23, 28):
            raise ValueError("Choose a supported software video quality.")
        if type(self.audio_bitrate) is not int or self.audio_bitrate not in (96, 128, 192, 256):
            raise ValueError("Choose a supported converted audio bitrate.")


def source_format(settings: VideoSettings, can_merge: bool) -> str:
    """Prefer AVC/AAC before fallback codecs; every normal branch respects the cap."""
    def choices(bound):
        video = f"[height<={bound}]" if bound else ""
        # Include common extractor spellings; MP4 alone does not guarantee AVC.
        avc = "[vcodec~='^(avc1|avc3|h264)']"
        aac = "[acodec~='^(mp4a[.]40[.]2|aac)']"
        progressive = f"best{video}[vcodec!=none][acodec!=none]"
        compatible = f"{progressive}[ext=mp4]{avc}{aac}"
        streams = f"bestvideo{video}{avc}+bestaudio{aac}"
        # If AAC is absent, keep AVC and convert only the audio. Do not choose
        # a costly VP9/AV1 video merely because its audio needs conversion.
        silent = f"best*{video}[vcodec!=none][acodec=none]"
        return ([streams, compatible, f"bestvideo{video}{avc}+bestaudio",
                 f"{progressive}{avc}", f"bestvideo{video}+bestaudio", progressive,
                 silent + avc, silent]
                if can_merge else [compatible, progressive + avc, progressive, silent + avc, silent])
    branches = choices(settings.resolution)
    # Only the resize profile can take a higher source when the cap is unavailable.
    if settings.resolution and settings.profile == "compatible_mp4":
        branches += choices(None)
    return "/".join(branches)
