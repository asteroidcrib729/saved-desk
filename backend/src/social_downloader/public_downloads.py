"""Public media adapters with a host-approved transfer for every stable media ID."""
import contextlib
import logging
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

from .models import MediaFailure, VideoSettings, canonical_target, contained_path, source_format
from .platforms import LABELS, requires_browser_session
from .tools import find_tool, javascript_runtime


class QuietLogger:
    def debug(self, message):
        pass
    info = debug
    warning = debug
    error = debug


class Transfer:
    def __init__(self, worker, command):
        self.worker, self.command = worker, command
        self.job = command["job_id"]
        self.root = Path(command["destination"]).resolve()
        self.settings = VideoSettings.from_command(command)
        self.seen = set()
        self.count = 0
        from .progress import Progress
        self.progress = Progress(worker,self.job)

    def decide(self, detail):
        key = detail["item_id"]
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,140}", key) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", detail["native_id"]):
            raise MediaFailure("The platform returned an unsupported media identity.")
        if key in self.seen:
            return False
        self.seen.add(key)
        self.count += 1
        self.worker.emit("item_decision_required", self.job, **detail)
        answer = self.worker.read()
        if not answer or answer.get("command") != "item_decision" or answer.get("job_id") != self.job or answer.get("item_id") != key or type(answer.get("transfer")) is not bool:
            raise ValueError("Expected a scoped transfer decision.")
        if not answer["transfer"]:
            self.worker.emit("item_skipped", self.job, item_id=key)
        if answer["transfer"]: self.progress.begin(key)
        return answer["transfer"]

    def complete(self, detail, path, audio_verified=False):
        from .live import EXTENSIONS, verify_image
        from .video import process_video
        from .previews import make_preview
        path = path.resolve()
        if path.parent != self.root or not path.is_file() or path.stat().st_size <= 0 or path.suffix[1:].lower() not in EXTENSIONS:
            raise MediaFailure("The downloaded file could not be verified. Completed files are preserved.")
        self.progress.processing()
        if detail["kind"] == "video":
            path = process_video(path, self.settings)
        elif detail["kind"] == "image":
            try:
                verify_image(path)
            except ValueError:
                path.rename(path.with_name(path.name + ".rejected"))
                raise MediaFailure("The platform returned an invalid image. It was not added to your library.") from None
        if detail["kind"]=="audio" and not audio_verified:
            from .audio import verify_audio
            verify_audio(path)
        make_preview(path)
        self.worker.emit("item_completed", self.job, item_id=detail["item_id"], relative_path=str(path.relative_to(self.root)), bytes_written=path.stat().st_size, original_path="")
        ack = self.worker.read()
        if not ack or ack.get("command") != "item_recorded" or ack.get("job_id") != self.job or ack.get("item_id") != detail["item_id"]:
            raise ValueError("Catalog acknowledgement is required.")


def gallery_detail(source, data):
    native = str(data.get("id", ""))
    number = data.get("num", 0)
    key = f"{native}_{number}"
    if source == "tiktok":
        author = data.get("author") or {}
        creator = author.get("nickname") or data.get("user") or "TikTok"
        caption = data.get("desc") or data.get("title") or "TikTok post"
        handle = data.get("user") or author.get("uniqueId") or "_"
        url = f"https://www.tiktok.com/@{handle}/video/{native}"
    elif source == "pinterest":
        author = data.get("pinner") or {}
        creator = author.get("full_name") or author.get("username") or "Pinterest"
        caption = data.get("description") or data.get("title") or "Pinterest pin"
        url = f"https://www.pinterest.com/pin/{native}/"
    else:
        raise MediaFailure("Choose a supported gallery platform.")
    ext = str(data.get("extension", "txt")).lower()
    return {"item_id": key, "native_id": native, "creator": str(creator)[:200], "caption": str(caption)[:2000],
            "kind": "text" if ext == "txt" else "video" if ext in ("mp4", "mkv", "webm", "m3u8") else "image", "url": canonical_target(source, url)}


def configure_gallery(source, target, settings, cookies=None, user_agent=None):
    from gallery_dl import config, extractor
    from requests.cookies import RequestsCookieJar
    config.clear()
    config.set(("cache",), "file", ":memory:")
    config.set(("downloader", "http"), "adjust-extensions", True)
    config.set(("downloader", "http"), "progress", .25)
    for key, value in {"retries": 2, "timeout": 20, "archive": None, "cookies": None, "cookies-update": False,
                       "proxy-env": False, "user-cache": "memory", "directory": [], "skip": True,
                       "postprocessors": [], "async": False, "metadata-url": None, "metadata-path": None, "metadata-extractor": None}.items():
        config.set(("extractor",), key, value)
    config.set(("extractor", source), "filename", "{_saveddesk_key}.{extension}")
    config.set(("extractor", "tiktok"), "audio", False)
    config.set(("extractor", "tiktok"), "covers", False)
    config.set(("extractor", "tiktok"), "subtitles", False)
    encoder = find_tool("ffmpeg")
    config.set(("downloader", "ytdl"), "format", source_format(settings, bool(encoder)))
    config.set(("downloader", "ytdl"), "module", "yt_dlp")
    config.set(("downloader", "ytdl"), "raw-options", {"ffmpeg_location": encoder, "merge_output_format": "mp4", "keepvideo": False, "logger": QuietLogger(), "quiet": True, "noprogress": True, "concurrent_fragment_downloads": 1, "retries": 2, "fragment_retries": 2})
    extr = extractor.find(target)
    if extr is None or extr.category != source:
        raise MediaFailure("This public link is not supported by the installed download engine.")
    extr._init_options()
    extr._init_session()
    from .authentication import cookie_jar, browser_user_agent
    extr.session.cookies = cookie_jar(source,cookies) if cookies else RequestsCookieJar()
    if user_agent:
        extr.session.headers["User-Agent"] = browser_user_agent(user_agent)
    extr.initialize()
    return extr


def gallery_download(transfer):
    from gallery_dl import config, extractor, job, output
    source, target = transfer.command["source"], transfer.command["target"]
    extr = configure_gallery(source, target, transfer.settings, transfer.command.get("cookies"), transfer.command.get("user_agent"))
    if transfer.command.get("test_origin"):
        from .test_support import public_fixture_extractor
        extr = public_fixture_extractor(source, transfer.command["test_origin"])
    config.set(("extractor",), "base-directory", str(transfer.root))

    class PublicJob(job.DownloadJob):
        def __init__(self, extr):
            super().__init__(extr)
            self.out = transfer.progress.output()
            self.failure = None

        def dispatch(self, messages):
            try:
                return super().dispatch(messages)
            except MediaFailure as failure:
                self.failure = failure
                raise

        def handle_queue(self, url, metadata):
            # Only board-owned section traversal may expand an approved board.
            from .platforms import is_collection
            if source != "pinterest" or not is_collection(source, target) or not url.startswith(target) or not re.fullmatch(re.escape(target) + r"id:[0-9]+", url):
                raise MediaFailure("The selected link expanded outside its approved collection.")
            child_extr = extractor.find(url)
            if child_extr is None or child_extr.category != source or child_extr.subcategory != "section":
                raise MediaFailure("This collection section is not supported.")
            child_extr._init_options()
            child_extr._init_session()
            child_extr.session.cookies = extr.session.cookies.copy()
            child_extr.session.headers.update(extr.session.headers)
            child = PublicJob(child_extr)
            child.run()
            self.status |= child.status
            if child.failure:
                raise child.failure

        def handle_url(self, url, metadata):
            detail = gallery_detail(source, metadata)
            if not transfer.decide(detail):
                return
            from .live import EXTENSIONS
            if str(metadata.get("extension", "")).lower() not in EXTENSIONS:
                raise MediaFailure("This post uses an unsupported file format. Completed files are preserved.")
            metadata["_saveddesk_key"] = detail["item_id"]
            super().handle_url(url, metadata)
            transfer.complete(detail, Path(self.pathfmt.path))

    result = PublicJob(extr)
    result.run()
    if result.failure:
        raise result.failure
    if result.status:
        raise MediaFailure(f"{LABELS[source]} could not finish this public download. The post may be unavailable, restricted, or rate limited. Completed files are preserved; retry unfinished items later.")


def video_download(transfer):
    from yt_dlp import YoutubeDL
    from yt_dlp.utils import DownloadError
    source, target = transfer.command["source"], transfer.command["target"]
    encoder = find_tool("ffmpeg")
    runtime = javascript_runtime()
    if source == "youtube" and not runtime and not transfer.command.get("test_origin"):
        raise MediaFailure("YouTube needs the bundled JavaScript runtime. Repair the SavedDesk installation.")
    options = {"quiet": True, "noprogress": True, "logger": QuietLogger(), "socket_timeout": 20,
               "retries": 2, "fragment_retries": 2, "extractor_retries": 2, "concurrent_fragment_downloads": 1,
               "format": source_format(transfer.settings, bool(encoder)), "ffmpeg_location": encoder, "merge_output_format": "mp4", "keepvideo": False,
               "overwrites": False, "continuedl": True, "restrictfilenames": True, "cachedir": False,
               "extract_flat": "in_playlist", "lazy_playlist": True, "noplaylist": "/playlist?" not in target,
               "js_runtimes": {"node": {"path": runtime}} if runtime else {}, "remote_components": [],
               "outtmpl": str(transfer.root / "%(id)s.%(ext)s"), "progress_hooks": [transfer.progress.hook]}
    with YoutubeDL(options) as ydl:
        if transfer.command.get("cookies"):
            from .authentication import cookie_jar, browser_user_agent
            ydl.cookiejar.clear()
            for cookie in cookie_jar(source,transfer.command["cookies"]): ydl.cookiejar.set_cookie(cookie)
            if transfer.command.get("user_agent"):
                ydl.params["http_headers"]["User-Agent"] = browser_user_agent(transfer.command["user_agent"])
        try:
            if transfer.command.get("test_origin"):
                from .test_support import public_video_fixture
                info = public_video_fixture(transfer.command["test_origin"])
            else:
                info = ydl.extract_info(target, download=False)
            if not info:
                raise MediaFailure("This public video is unavailable.")
            entries = info.get("entries", ()) if info.get("_type") == "playlist" else (info,)
            for entry in entries:
                if not entry:
                    raise MediaFailure("A collection item is unavailable. Completed files are preserved.")
                if entry.get("_type") in ("url", "url_transparent"):
                    if source != "youtube" or not re.fullmatch(r"[A-Za-z0-9_-]{11}", str(entry.get("id", ""))):
                        raise MediaFailure("This collection contains an unsupported item.")
                    entry = ydl.extract_info("https://www.youtube.com/watch?v=" + entry["id"], download=False)
                native = str(entry.get("id", ""))
                if entry.get("is_live") or entry.get("live_status") in ("is_live", "is_upcoming") or entry.get("has_drm"):
                    raise MediaFailure("Live broadcasts and protected media are not supported. Choose an available public recording.")
                if source == "youtube":
                    url = canonical_target(source, "https://www.youtube.com/watch?v=" + native)
                else:
                    url = canonical_target(source, target if transfer.command.get("test_origin") else entry.get("webpage_url") or target)
                detail = {"item_id": native, "native_id": native, "creator": str(entry.get("uploader") or entry.get("channel") or LABELS[source])[:200],
                          "caption": str(entry.get("title") or "Saved video")[:2000], "kind": "video", "url": url}
                if not transfer.decide(detail):
                    continue
                ydl.params["outtmpl"] = {"default": str(transfer.root / (native + ".%(ext)s"))}
                result = ydl.process_ie_result(entry, download=True)
                # Merging deletes requested_downloads' component files. Use the final
                # existing output, never a missing stream or an arbitrary path.
                result = result or {}
                candidates = [result.get("filepath"), result.get("_filename"),
                    str(transfer.root / (native + "." + str(result.get("ext", "mp4"))))]
                candidates += [d.get("filepath") for d in result.get("requested_downloads", [])]
                paths = []
                for value in candidates:
                    if not isinstance(value, str):
                        continue
                    candidate = Path(value).resolve()
                    if candidate.parent == transfer.root and candidate.is_file() and candidate.suffix.lower() in {".mp4", ".webm", ".mkv"} and candidate not in paths:
                        paths.append(candidate)
                outputs = [p for p in transfer.root.glob(native + ".*") if p.suffix.lower() in {".mp4", ".webm", ".mkv"} and ".compatible" not in p.name and ".f" not in p.name]
                path = paths[0] if paths else outputs[0] if len(outputs) == 1 else None
                if path is None:
                    raise MediaFailure("The downloaded video output could not be identified. Completed files are preserved.")
                transfer.complete(detail, path)
        except DownloadError:
            if requires_browser_session(source,target):
                raise MediaFailure("YouTube could not read this account playlist or an included video. Reapprove your YouTube browser session, then add the playlist again. Completed files are preserved.") from None
            if source=="facebook":
                raise MediaFailure("Facebook could not read this public video page. Some Facebook pages currently require a downloader compatibility update or sign-in. An approved Facebook browser session can supply access, but cannot fix every parser compatibility problem. Completed files are preserved.") from None
            raise MediaFailure(f"{LABELS[source]} could not provide this public video. It may require sign-in, be unavailable, or be rate limited. Completed files are preserved.") from None


def discord_download(transfer):
    """Download only the user-selected CDN media; never request Discord account/message APIs."""
    import os
    import requests
    from urllib.parse import unquote
    target = transfer.command["target"]
    parts = urlsplit(target).path.strip("/").split("/")
    native = parts[2]
    filename = unquote(parts[-1])
    ext = filename.rsplit(".", 1)[-1].lower()
    kind = "video" if ext in ("mp4", "mkv", "webm", "mov", "m4v", "avi") else "audio" if ext in ("mp3", "m4a", "wav", "ogg", "opus", "flac", "aac") else "image"
    detail = {"item_id":native,"native_id":native,"creator":"Discord","caption":filename,"kind":kind,"url":target.split("?",1)[0]}
    if not transfer.decide(detail):
        return
    path = contained_path(transfer.root, native + "." + ext)
    audio_verified=False
    if not path.exists():
        download_url = target
        if transfer.command.get("test_origin"):
            from .test_support import loopback_origin
            download_url = loopback_origin(transfer.command["test_origin"]) + "/media/" + native
        temporary = contained_path(transfer.root, native + ".partial." + ext)
        try:
            with requests.Session() as session:
                session.trust_env = False
                with session.get(download_url, timeout=(10,30), stream=True, allow_redirects=False) as response:
                    if response.status_code in (401,403,404,410):
                        raise MediaFailure("This Discord attachment link has expired or is unavailable. Copy a fresh media link from Discord and use Add download again. Existing files are preserved.")
                    if response.status_code == 429:
                        wait=response.headers.get("Retry-After", "")
                        retry=f" Try again after {int(wait)} seconds." if wait.isdigit() and 0<int(wait)<=86400 else " Try again later."
                        raise MediaFailure("Discord is limiting this attachment transfer." + retry)
                    if response.status_code != 200:
                        raise MediaFailure("Discord could not provide this attachment. Check your connection and retry later.")
                    if response.headers.get("Content-Type", "").split(";",1)[0].lower() in ("text/html","application/json","text/plain"):
                        raise MediaFailure("Discord returned a page instead of media. Copy the attachment's media link.")
                    length=response.headers.get("Content-Length", "")
                    expected=int(length) if length.isdigit() else None
                    if expected is not None and expected>10*1024**3:
                        raise MediaFailure("This attachment exceeds the 10 GB supported limit.")
                    size=0
                    with temporary.open("wb") as output:
                        for chunk in response.iter_content(65536):
                            size+=len(chunk)
                            if size>10*1024**3:raise MediaFailure("This attachment exceeds the 10 GB supported limit.")
                            output.write(chunk)
                            transfer.progress.update(size,expected)
                    if not size or expected is not None and size!=expected:
                        raise MediaFailure("This attachment transfer was incomplete. Copy a fresh media link and retry.")
            if kind=="image":
                from .live import verify_image
                try:verify_image(temporary)
                except ValueError:raise MediaFailure("Discord returned an invalid image. Nothing was added to the library.") from None
            if kind=="audio":
                from .audio import verify_audio
                verify_audio(temporary)
                audio_verified=True
            # Publish without overwriting another file; partially received media is never cataloged.
            if sys.platform=="win32":os.rename(temporary,path)
            else:os.link(temporary,path);temporary.unlink()
        except requests.RequestException:
            raise MediaFailure("This attachment transfer was interrupted. Completed files are preserved; retry with a fresh media link.") from None
        finally:
            temporary.unlink(missing_ok=True)
    transfer.complete(detail,path,audio_verified=audio_verified)


def execute(worker, command):
    source = command["source"]
    target = canonical_target(source, command["target"])
    if requires_browser_session(source,target) and not command.get("cookies"):
        raise MediaFailure("Watch Later and Liked videos require an approved YouTube browser session. Connect or reconnect YouTube in Accounts. Google identity sign-in alone does not supply this session.")
    if command.get("cookies"):
        from .browser_sessions import approve_session
        identity = approve_session(source,command["cookies"])
        if identity["account_id"] != command.get("account_id"):
            raise MediaFailure("This download belongs to another approved browser session. Reconnect the original session or add a new download.")
    elif command.get("account_id") not in (None, "", "public"):
        raise MediaFailure("The approved browser session is missing. Reconnect this platform.")
    command = {**command, "target": target}
    transfer = Transfer(worker, command)
    transfer.root.mkdir(parents=True, exist_ok=True)
    worker.emit("started", transfer.job)
    logging.disable(logging.CRITICAL)
    with contextlib.redirect_stdout(sys.stderr):
        if source in ("youtube", "facebook") or (source=="tiktok" and "/video/" in target):
            video_download(transfer)
        elif source == "discord":
            discord_download(transfer)
        else:
            gallery_download(transfer)
    if not transfer.count:
        raise MediaFailure("No supported public media was found at this link. This platform may require sign-in or an engine update.")
    worker.emit("completed", transfer.job)
