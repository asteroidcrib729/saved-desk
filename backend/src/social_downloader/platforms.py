"""Explicit supported platform routes. Never delegate arbitrary URLs to generic extractors."""
import re
from urllib.parse import urlsplit, urlunsplit, parse_qs, urlencode, unquote, quote

PUBLIC_SOURCES = ("youtube", "facebook", "tiktok", "pinterest", "discord")
LABELS = {"youtube": "YouTube", "facebook": "Facebook", "tiktok": "TikTok", "pinterest": "Pinterest", "discord": "Discord"}


def canonical_public(source, value):
    if source not in PUBLIC_SOURCES:
        raise ValueError("Choose a supported platform.")
    value = value.strip()
    try:
        u = urlsplit(value)
        port = u.port
    except ValueError:
        raise ValueError("Use a valid HTTPS link for the selected platform.") from None
    if "\\" in value or re.search(r"(?:^|/)\.\.?(?:/|$)", u.path) or "%2e" in u.path.lower() or len(value) > 2000 or u.scheme != "https" or u.username or u.password or port not in (None, 443):
        raise ValueError("Use a valid HTTPS link for the selected platform.")
    host, path = u.hostname, u.path.rstrip("/")
    q = parse_qs(u.query, keep_blank_values=True)
    one = lambda key: q.get(key, [""])[0] if len(q.get(key, [])) == 1 else ""
    token = lambda s: bool(re.fullmatch(r"[A-Za-z0-9_-]{1,120}", s))
    digits = lambda s: bool(re.fullmatch(r"[0-9]{1,40}", s))
    if source == "youtube":
        video = None
        if host == "youtu.be":
            video = path[1:]
        elif host in ("youtube.com", "www.youtube.com", "m.youtube.com"):
            if path == "/watch":
                video = one("v")
            elif re.fullmatch(r"/(?:shorts|live|embed)/[A-Za-z0-9_-]+", path):
                video = path.split("/")[-1]
            elif path == "/playlist" and token(one("list")) and (one("list") in ("WL", "LL") or len(one("list")) >= 10) and not one("list").startswith("RD"):
                return "https://www.youtube.com/playlist?" + urlencode({"list": one("list")})
        if video and re.fullmatch(r"[A-Za-z0-9_-]{11}", video):
            return "https://www.youtube.com/watch?" + urlencode({"v": video})
    elif source == "facebook" and host in ("facebook.com", "www.facebook.com", "m.facebook.com"):
        if path in ("/watch", "/video.php") and digits(one("v")):
            return "https://www.facebook.com/watch/?" + urlencode({"v": one("v")})
        if re.fullmatch(r"/reel/[0-9]{1,40}|/[A-Za-z0-9._-]+/videos/[0-9]{1,40}", path):
            return "https://www.facebook.com" + path + "/"
    elif source == "tiktok" and host in ("tiktok.com", "www.tiktok.com"):
        if re.fullmatch(r"/@[A-Za-z0-9._-]+/(?:video|photo)/[0-9]{1,40}", path):
            return "https://www.tiktok.com" + path
    elif source == "pinterest" and host in ("pinterest.com", "www.pinterest.com"):
        if re.fullmatch(r"/pin/[0-9]{1,40}", path):
            return "https://www.pinterest.com" + path + "/"
        parts = path.strip("/").split("/")
        if len(parts) in (2, 3) and parts[0] not in ("pin", "ideas", "search", "settings", "login", "business", "today") and all(re.fullmatch(r"[A-Za-z0-9_-]{1,120}", s) for s in parts):
            return "https://www.pinterest.com" + path + "/"
    elif source == "discord" and host == "cdn.discordapp.com":
        parts = path.strip("/").split("/")
        if len(parts) == 4 and parts[0] == "attachments" and digits(parts[1]) and digits(parts[2]):
            try:
                filename = unquote(parts[3], errors="strict")
            except UnicodeError:
                filename = ""
            ext = filename.rsplit(".", 1)[-1].lower()
            media = {"jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "mp4", "mkv", "webm", "mov", "m4v", "avi", "mp3", "m4a", "wav", "ogg", "opus", "flac", "aac"}
            if filename and len(filename.encode("utf-8")) <= 240 and not any(ord(c)<32 or ord(c)==127 or c in '/\\<>:"|?*#%' for c in filename) and filename not in (".", "..") and ext in media:
                signed = {key: one(key) for key in ("ex", "is", "hm") if key in q}
                if all(re.fullmatch(r"[A-Fa-f0-9]{1,128}", val) for val in signed.values()):
                    clean_path = "/attachments/" + parts[1] + "/" + parts[2] + "/" + quote(filename, safe="._-")
                    return urlunsplit(("https", host, clean_path, urlencode(signed), ""))
    raise ValueError("Paste a full supported post, video, YouTube playlist, or Pinterest board link from the selected platform. For Discord, copy an image, video or audio attachment link from cdn.discordapp.com. Short share links are not supported yet.")


def is_collection(source, target):
    return source == "youtube" and "/playlist?" in target or source == "pinterest" and "/pin/" not in target


def requires_browser_session(source, target):
    return source == "youtube" and target in ("https://www.youtube.com/playlist?list=WL", "https://www.youtube.com/playlist?list=LL")
