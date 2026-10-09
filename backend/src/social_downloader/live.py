"""Pinned gallery-dl adapter. SQLite host decisions precede every media request."""
import contextlib
import logging
import os
from pathlib import Path
import re
import sys

from .models import MediaFailure, VideoSettings, canonical_target, contained_path, source_format
from .tools import find_tool

EXTENSIONS = {"bmp", "avif", "mov", "m4v", "avi", "mp3", "wav", "ogg", "opus", "flac", "aac", "jpg", "jpeg", "png", "webp", "gif", "mp4", "mkv", "webm", "m4a", "txt"}


def verify_image(path):
    with path.open("rb") as stream:
        header = stream.read(64)
    extension = path.suffix.lstrip(".").lower()
    valid = ((extension in {"jpg", "jpeg"} and header.startswith(b"\xff\xd8\xff")) or
             (extension == "png" and header.startswith(b"\x89PNG\r\n\x1a\n")) or
             (extension == "gif" and header.startswith((b"GIF87a", b"GIF89a"))) or
             (extension == "webp" and header.startswith(b"RIFF") and header[8:12] == b"WEBP") or
             (extension == "bmp" and header.startswith(b"BM")) or
             (extension == "avif" and header[4:8] == b"ftyp" and any(header[i:i+4] in (b"avif", b"avis") for i in (8, *range(16, min(len(header), int.from_bytes(header[:4], "big")), 4)))))
    if not valid:
        raise ValueError("The server returned an invalid image. The file was not added to your library.")


def configured_extractor(source, target, cookies, settings, user_agent=None):
    from gallery_dl import config, extractor
    from .authentication import browser_user_agent, cookie_jar
    user_agent = browser_user_agent(user_agent)
    config.clear()
    config.set(("cache",), "file", ":memory:")
    # Instagram can label JPEG responses as HEIC. Inspect bytes before naming
    # the final file; never assume the provider extension is the actual format.
    config.set(("downloader", "http"), "adjust-extensions", True)
    config.set(("downloader", "http"), "progress", .25)
    for key, value in {"retries": 2, "timeout": 20, "archive": None, "cookies": None, "cookies-update": False, "proxy-env": False,
                       "user-cache": "memory", "directory": [], "skip": True, "postprocessors": [], "async": False,
                       "metadata-url": None, "metadata-path": None, "metadata-extractor": None}.items():
        config.set(("extractor",), key, value)
    category = "instagram" if source == "instagram" else "twitter"
    config.set(("extractor", category), "filename", "{media_id}.{extension}" if source == "instagram" else "{tweet_id}_{num}.{extension}")
    config.set(("extractor", category), "videos", True if source == "instagram" else "ytdl")
    config.set(("extractor", category), "text-tweets", True)
    config.set(("extractor", category), "quoted", False)
    config.set(("extractor", category), "cards", False)
    config.set(("extractor", category), "ratelimit", "abort")
    if settings:
        encoder = find_tool("ffmpeg")
        config.set(("downloader", "ytdl"), "format", source_format(settings, bool(encoder)))
        config.set(("downloader", "ytdl"), "module", "yt_dlp")
        config.set(("downloader", "ytdl"), "raw-options", {"ffmpeg_location": encoder, "merge_output_format": "mp4", "keepvideo": False, "quiet": True, "noprogress": True, "concurrent_fragment_downloads": 1, "retries": 2, "fragment_retries": 2})
    if source == "instagram" and user_agent:
        config.set(("extractor", category), "user-agent", user_agent)
        config.set(("extractor", category), "browser", "firefox" if "Firefox/" in user_agent else "chrome")
    extr = extractor.find(canonical_target(source, target))
    if extr is None or extr.category != category:
        raise ValueError("This link is not supported. Choose saved posts, a collection, bookmarks, or a single post.")
    # Initialize once, then replace cookies before _init needs them (not via disk).
    extr._init_options()
    extr._init_session()
    if source == "instagram" and user_agent:
        # Do not pair actual browser identity with the engine's fixed-version hints.
        for key in list(extr.session.headers):
            if key.lower().startswith("sec-ch-ua"):
                del extr.session.headers[key]
    extr.session.cookies = cookie_jar(source, cookies)
    extr.initialize()
    return extr


def item_metadata(source, metadata):
    if source == "instagram":
        native = str(metadata.get("post_id") or metadata.get("sidecar_media_id") or metadata.get("media_id", ""))
        file_key = str(metadata.get("media_id", ""))
        creator = str(metadata.get("username") or metadata.get("user", {}).get("username") or "Instagram")
        caption = metadata.get("description") or metadata.get("caption") or "Saved Instagram post"
        url = metadata.get("post_url", "")
    else:
        native = str(metadata.get("tweet_id", ""))
        file_key = f"{native}_{metadata.get('num', 0)}"
        creator = str(metadata.get("user", {}).get("name") or metadata.get("user", {}).get("screen_name") or "X")
        caption = metadata.get("content") or metadata.get("full_text") or "Saved X post"
        handle = metadata.get("user", {}).get("screen_name")
        url = f"https://x.com/{handle}/status/{native}" if isinstance(handle, str) and re.fullmatch(r"[A-Za-z0-9_]{1,30}", handle) else f"https://x.com/i/status/{native}"
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", native) or not re.fullmatch(r"[A-Za-z0-9_-]{1,140}", file_key):
        raise ValueError("The platform returned an unsupported media identity.")
    extension = str(metadata.get("extension", "txt")).lower()
    kind = "text" if extension == "txt" else "video" if extension in {"mp4", "mkv", "webm", "mov", "m4v", "avi"} else "image"
    return {"item_id": file_key, "native_id": native, "creator": creator[:200], "caption": str(caption)[:2000], "kind": kind, "url": url[:1000]}


def execute(worker, command):
    from .platforms import PUBLIC_SOURCES
    if command.get("source") not in ("instagram", "x", *PUBLIC_SOURCES):
        raise ValueError("Choose a supported platform.")
    if command.get("source") in PUBLIC_SOURCES:
        from .public_downloads import execute as execute_public
        return execute_public(worker, command)
    from gallery_dl import config, job, output
    logging.disable(logging.CRITICAL)
    source, job_id = command["source"], command["job_id"]
    settings = VideoSettings.from_command(command)
    root = Path(command["destination"]).resolve()
    root.mkdir(parents=True, exist_ok=True)
    if command.get("account_id"):
        from .authentication import ConnectionFailure, verify_account
        identity = verify_account(source, command["cookies"], test_origin=command.get("test_origin"), user_agent=command.get("user_agent"))
        if identity["account_id"] != command["account_id"]:
            raise ConnectionFailure("The browser account changed. Reconnect the original account before resuming this download.")
    from .progress import Progress
    progress = Progress(worker,job_id)
    worker.emit("started", job_id)
    # Engine prints and diagnostics never share protocol stdout.
    with contextlib.redirect_stdout(sys.stderr):
        extr = configured_extractor(source, command["target"], command["cookies"], settings, user_agent=command.get("user_agent"))
        if command.get("test_origin"):
            from .test_support import fixture_extractor
            extr = fixture_extractor(source, command["test_origin"])
        config.set(("extractor",), "base-directory", str(root))

        class CatalogJob(job.DownloadJob):
            def __init__(self, extractor):
                super().__init__(extractor)
                self.out = progress.output()
                self.processing_error = None

            def dispatch(self, messages):
                try:
                    return super().dispatch(messages)
                except MediaFailure as failure:
                    # gallery-dl catches adapter exceptions in run(). Preserve only
                    # our controlled message across that boundary; never raw engine errors.
                    self.processing_error = failure
                    raise

            def handle_queue(self, url, metadata):
                # The approved target cannot expand into unrelated engine categories.
                raise ValueError("This link expands into unsupported content. Choose a direct post or collection.")

            def decide(self, metadata):
                detail = item_metadata(source, metadata)
                worker.emit("item_decision_required", job_id, **detail)
                decision = worker.read()
                if not decision or decision.get("job_id") != job_id or decision.get("item_id") != detail["item_id"] or decision.get("command") != "item_decision" or type(decision.get("transfer")) is not bool:
                    raise ValueError("Expected a scoped transfer decision.")
                if not decision["transfer"]:
                    worker.emit("item_skipped", job_id, item_id=detail["item_id"])
                    return None
                progress.begin(detail["item_id"])
                return detail

            def reject_item(self, detail, message, path=None):
                if path is not None:
                    # Quarantine unverified responses so retries fetch fresh bytes.
                    import uuid
                    os.rename(path, path.with_name(path.name + ".rejected-" + uuid.uuid4().hex))
                worker.emit("item_failed", job_id, item_id=detail["item_id"], message=message)
                self.status |= 4
                if self.processing_error is None:
                    self.processing_error = MediaFailure(message)

            def complete(self, detail, path):
                path = path.resolve()
                if not path.is_relative_to(root) or not path.is_file() or path.stat().st_size <= 0:
                    raise ValueError("The downloaded file could not be verified.")
                if path.suffix.lstrip(".").lower() not in EXTENSIONS:
                    self.reject_item(detail, "A file uses an unsupported media format and was not added to your library. Other items were processed; completed files are preserved.", path)
                    return
                progress.processing()
                if detail["kind"] == "video":
                    from .video import process_video, UnreadableVideo
                    try:
                        path = process_video(path, settings)
                    except MediaFailure as failure:
                        # Keep this unrecorded video for retry; finish the other approved
                        # collection items instead of restarting a large batch at this file.
                        self.reject_item(detail, str(failure), path if isinstance(failure, UnreadableVideo) else None)
                        return
                elif detail["kind"] == "image":
                    try:
                        verify_image(path)
                    except ValueError:
                        self.reject_item(detail, "The server returned an invalid image and it was not added to your library. Other items were processed; completed files are preserved.", path)
                        return
                from .previews import make_preview
                make_preview(path)
                worker.emit("item_completed", job_id, item_id=detail["item_id"], relative_path=str(path.relative_to(root)), bytes_written=path.stat().st_size, original_path="")
                ack = worker.read()
                if not ack or ack.get("command") != "item_recorded" or ack.get("job_id") != job_id or ack.get("item_id") != detail["item_id"]:
                    raise ValueError("Catalog acknowledgement is required.")

            def handle_url(self, url, metadata):
                detail = self.decide(metadata)
                if not detail:
                    return
                extension = str(metadata.get("extension", "")).lower()
                # Allow this known Instagram hint through signature correction.
                # The final output still passes the strict format/header checks.
                if extension not in EXTENSIONS and not (source == "instagram" and extension == "heic"):
                    self.reject_item(detail, "A file uses an unsupported media format and was not downloaded. Other items were processed; completed files are preserved.")
                    return
                super().handle_url(url, metadata)
                path = Path(self.pathfmt.path)
                if not path.is_file() or not path.stat().st_size:
                    worker.emit("item_failed", job_id, item_id=detail["item_id"], message="This file could not be downloaded. Retry after checking your connection.")
                    return
                self.complete(detail, path)

            def handle_directory(self, metadata):
                super().handle_directory(metadata)
                if source == "x" and metadata.get("count") == 0:
                    detail = self.decide({**metadata, "num": 0, "extension": "txt"})
                    if detail:
                        body = str(metadata.get("content") or metadata.get("full_text") or detail["caption"])
                        if len(body.encode("utf-8")) > 1024 * 1024:
                            raise MediaFailure("This text post exceeds the supported size and was not saved. Other saved files are preserved.")
                        path = contained_path(root, detail["item_id"] + ".txt")
                        if path.exists():
                            import uuid
                            path = contained_path(root, detail["item_id"] + "-" + uuid.uuid4().hex + ".txt")
                        with path.open("x", encoding="utf-8") as stream:
                            # UI/catalog summaries are bounded separately from the actual post.
                            stream.write(body + "\n\n" + detail["url"] + "\n")
                            stream.flush()
                            os.fsync(stream.fileno())
                        self.complete(detail, path)

        result = CatalogJob(extr)
        result.run()
        if result.processing_error is not None:
            raise result.processing_error
        if result.status:
            raise ValueError("The platform stopped this download. Your saved files are preserved. Reconnect if your session expired, then retry.")
    worker.emit("completed", job_id)
