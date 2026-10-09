"""Explicit loopback fixtures for packaged integration. Never discovers accounts."""
from urllib.parse import urlsplit


def loopback_origin(value):
    parts = urlsplit(value)
    if parts.scheme != "http" or parts.hostname != "127.0.0.1" or not parts.port or parts.username or parts.password or parts.path not in ("", "/") or parts.query or parts.fragment:
        raise ValueError("Test origins must be explicit loopback origins.")
    return f"http://127.0.0.1:{parts.port}"


def fixture_extractor(source, origin):
    from gallery_dl.extractor.common import Extractor, Message
    import requests
    origin = loopback_origin(origin)

    class FixtureExtractor(Extractor):
        category = "instagram" if source == "instagram" else "twitter"
        subcategory = "saveddesk_fixture"
        filename_fmt = "{media_id}.{extension}" if source == "instagram" else "{tweet_id}_{num}.{extension}"
        directory_fmt = ()
        cookies_domain = None

        def _init(self):
            pass

        def items(self):
            with requests.get(origin + "/items", timeout=5) as response:
                response.raise_for_status()
                entries = response.json()
            if not isinstance(entries, list) or len(entries) > 200:
                raise ValueError("Invalid fixture item count.")
            numbers = {}
            for item in entries:
                numbers[item["post"]] = numbers.get(item["post"], 0) + 1
                extension = item.get("extension", "jpg")
                metadata = {"post_id": item["post"], "media_id": item["id"], "tweet_id": item["post"], "num": item.get("num", numbers[item["post"]]), "username": "fixture_user", "user": {"name": "fixture_user", "screen_name": "fixture_user"}, "description": "Synthetic integration content", "content": "Synthetic integration content", "extension": extension, "count": 0 if extension == "txt" else 1, "post_url": "https://www.instagram.com/p/fixture/"}
                if "content" in item:
                    metadata["content"] = item["content"]
                yield Message.Directory, "", metadata
                if extension != "txt":
                    yield Message.Url, origin + "/media/" + item["id"], metadata

    import re
    return FixtureExtractor(re.match(r".*", origin))


def public_fixture_extractor(source, origin):
    from gallery_dl.extractor.common import Extractor, Message
    import re
    import requests
    origin = loopback_origin(origin)
    class Fixture(Extractor):
        category = source
        subcategory = "saveddesk_fixture"
        filename_fmt = "{_saveddesk_key}.{extension}"
        directory_fmt = ()
        cookies_domain = None
        def _init(self):
            pass
        def items(self):
            with requests.get(origin + "/items", timeout=5) as response:
                response.raise_for_status()
                entries=response.json()
            if not isinstance(entries,list) or len(entries)>200:
                raise ValueError("Invalid fixture item count.")
            for item in entries:
                metadata={"id":item["post"],"num":item.get("num",1),"extension":item.get("extension","jpg"),"user":"fixture_user", "author":{"uniqueId":"fixture_user","nickname":"fixture_user"} if source=="tiktok" else "fixture_user", "description":"Synthetic public content","title":"Synthetic public content","selftext":"Synthetic post text","count":1}
                yield Message.Directory,"",metadata
                if metadata["extension"]!="txt":
                    yield Message.Url,origin+"/media/"+item["id"],metadata
    return Fixture(re.match(r".*",origin))


def public_video_fixture(origin):
    origin=loopback_origin(origin)
    return {"id":"BaW_jenozKc", "title":"Synthetic public video", "uploader":"fixture_user", "webpage_url":"https://www.facebook.com/reel/123456789/", "extractor":"saveddesk_fixture", "extractor_key":"Generic", "formats":[{"format_id":"fixture","url":origin+"/video.mp4","ext":"mp4","vcodec":"h264","acodec":"aac","height":720}]}
