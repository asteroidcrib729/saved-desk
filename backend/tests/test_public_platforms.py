import io
import json
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import tempfile
import threading
import unittest
from unittest.mock import patch

from social_downloader.authentication import ConnectionFailure
from social_downloader.live import execute
from social_downloader.models import MediaFailure, VideoSettings
from social_downloader.platforms import canonical_public, PUBLIC_SOURCES
from social_downloader.public_downloads import configure_gallery
from social_downloader.worker import Worker

ROOT=Path(__file__).resolve().parents[2]
TARGETS={"youtube":"https://www.youtube.com/watch?v=BaW_jenozKc", "facebook":"https://www.facebook.com/reel/123456789/", "tiktok":"https://www.tiktok.com/@fixture_user/photo/123456789", "pinterest":"https://www.pinterest.com/pin/123456789/", "discord":"https://cdn.discordapp.com/attachments/111/222/image.jpg?ex=abcdef&is=123abc&hm=abc123"}

class PublicPlatformTests(unittest.TestCase):
    def setUp(self):
        self.requests=[]
        self.entries=[{"id":"asset1","post":"123456789","num":1}]
        self.status=200
        self.content_type="application/octet-stream"
        self.retry_after=""
        self.payload=None
        self.length_extra=0
        self.redirect=""
        owner=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):
                pass
            def do_GET(self):
                owner.requests.append((self.path,dict(self.headers)))
                if self.path=="/items":
                    body=json.dumps(owner.entries).encode()
                else:
                    body=owner.payload if owner.payload is not None else b"\xff\xd8\xff" + b"synthetic test image"*20
                self.send_response(owner.status if self.path.startswith("/media/") else 200)
                self.send_header("Content-Length",str(len(body)+owner.length_extra))
                self.send_header("Content-Type",owner.content_type)
                if owner.redirect:self.send_header("Location",owner.redirect)
                if owner.retry_after:self.send_header("Retry-After",owner.retry_after)
                self.end_headers()
                self.wfile.write(body)
        self.server=ThreadingHTTPServer(("127.0.0.1",0),Handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.origin=f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def job(self,source,root,keys,transfer=True,target=None,direct=False):
        frames=[]
        for key in keys:
            frames.append({"command":"item_decision","job_id":"public-test","item_id":key,"transfer":transfer,"protocol_version":1})
            if transfer:
                frames.append({"command":"item_recorded","job_id":"public-test","item_id":key,"protocol_version":1})
        out=io.StringIO()
        with patch("social_downloader.previews.make_preview"),patch("social_downloader.video.process_video",side_effect=lambda path,settings:path),patch("social_downloader.playback.prepare_download_video"):
            # Engine-boundary tests use synthetic bytes; real codec readiness is tested separately.
            execute(Worker(io.StringIO("".join(json.dumps(f)+"\n" for f in frames)),out),{"source":source,"target":target or TARGETS[source],"job_id":"public-test","destination":str(root),"account_id":"public","cookies":[],"test_origin":None if direct else self.origin})
        return [json.loads(line) for line in out.getvalue().splitlines()]

    def test_discord_direct_request_keeps_signature_and_does_not_follow_redirects(self):
        import requests
        original=requests.Session.get
        seen=[]
        def routed(session,url,**options):
            seen.append((url,options))
            return original(session,self.origin+"/media/222",**options)
        with tempfile.TemporaryDirectory() as folder,patch("requests.Session.get",routed):
            self.job("discord",Path(folder),["222"],direct=True)
            self.assertEqual(seen[0][0],TARGETS["discord"])
            self.assertFalse(seen[0][1]["allow_redirects"])
        self.status=302
        self.redirect="http://127.0.0.1:1/private"
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(MediaFailure):self.job("discord",Path(folder),["222"])
            self.assertEqual(list(Path(folder).iterdir()),[])
        self.assertEqual(len(self.requests),2)

    def test_discord_interrupted_transfer_removes_partial_file(self):
        self.length_extra=7
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(MediaFailure,"interrupted|incomplete"):
                self.job("discord",Path(folder),["222"])
            self.assertEqual(list(Path(folder).iterdir()),[])

    def test_discord_invalid_audio_is_not_published(self):
        self.payload=b"this is not audio"
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(MediaFailure):
                self.job("discord",Path(folder),["222"],target=TARGETS["discord"].replace("image.jpg","voice.wav"))
            self.assertEqual(list(Path(folder).iterdir()),[])

    def test_shared_url_contract(self):
        for case in json.loads((ROOT/"contracts/platform-targets.json").read_text()):
            with self.subTest(case=case):
                if case["output"] is None:
                    with self.assertRaises(ValueError):
                        canonical_public(case["source"],case["input"])
                else:
                    self.assertEqual(canonical_public(case["source"],case["input"]),case["output"])

    def test_pinterest_and_tiktok_transfer_only_after_host_decision(self):
        for source in ("pinterest","tiktok"):
            with self.subTest(source=source),tempfile.TemporaryDirectory() as root:
                self.requests.clear()
                events=self.job(source,root,["123456789_1"],False)
                self.assertEqual(events[-1]["event"],"completed")
                self.assertEqual([path for path,_ in self.requests],["/items"])
                events=self.job(source,root,["123456789_1"])
                self.assertEqual(events[-1]["event"],"completed")
                self.assertTrue((Path(root)/"123456789_1.jpg").is_file())
                self.assertEqual([path for path,_ in self.requests],["/items","/items","/media/asset1"])
                self.assertTrue(all("Cookie" not in headers and "Authorization" not in headers for _,headers in self.requests))

    def test_removed_reddit_is_rejected_before_network_or_storage(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(ValueError):
                canonical_public("reddit","https://www.reddit.com/comments/abc123/")
            with self.assertRaises(ValueError):
                self.job("reddit",root,[],target="https://www.reddit.com/comments/abc123/")
            self.assertEqual(self.requests,[])
            self.assertEqual(list(Path(root).iterdir()),[])

    def test_video_engines_are_packaged_and_host_skip_avoids_transfer(self):
        for source in ("youtube","facebook","tiktok"):
            with self.subTest(source=source),tempfile.TemporaryDirectory() as root:
                target=TARGETS[source].replace("/photo/","/video/")
                self.requests.clear()
                self.job(source,root,["BaW_jenozKc"],False,target=target)
                self.assertEqual(self.requests,[])
                events=self.job(source,root,["BaW_jenozKc"],target=target)
                self.assertEqual([p for p,_ in self.requests],["/video.mp4"])
                self.assertTrue((Path(root)/"BaW_jenozKc.mp4").is_file())
                self.assertEqual(events[-1]["event"],"completed")

    def test_discord_selected_attachment_and_skip(self):
        with tempfile.TemporaryDirectory() as root:
            self.job("discord",root,["222"],False)
            self.assertEqual(self.requests,[])
            events=self.job("discord",root,["222"])
            self.assertEqual(events[-1]["event"],"completed")
            self.assertEqual([p for p,_ in self.requests],["/media/222"])
            self.assertTrue((Path(root)/"222.jpg").is_file())

    def test_expired_discord_link_has_actionable_message(self):
        self.status=403
        with tempfile.TemporaryDirectory() as root,self.assertRaisesRegex(MediaFailure,"fresh media link"):
            self.job("discord",root,["222"])
            self.assertFalse(list(Path(root).glob("*.jpg")))

    def test_removed_source_is_rejected_before_network_access(self):
        with self.assertRaises(ValueError):
            canonical_public("spotify","https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ")
        self.assertEqual(self.requests,[])

    def test_discord_rejects_html_and_cleans_partial_files(self):
        self.content_type="text/html";self.payload=b"<html>not media</html>"
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(MediaFailure,"instead of media"):self.job("discord",root,["222"])
            self.assertEqual(list(Path(root).iterdir()),[])
        self.content_type="application/octet-stream"
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(MediaFailure,"invalid image"):self.job("discord",root,["222"])
            self.assertEqual(list(Path(root).iterdir()),[])

    def test_discord_rate_limit_is_bounded_and_does_not_retry_or_leak_signature(self):
        self.status=429;self.retry_after="45"
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(MediaFailure,"45 seconds") as error:self.job("discord",root,["222"])
            self.assertNotIn("hm=",str(error.exception));self.assertEqual(len(self.requests),1)
            self.assertEqual(list(Path(root).iterdir()),[])

    def test_discord_does_not_send_or_accept_browser_identity(self):
        with tempfile.TemporaryDirectory() as root:
            self.job("discord",root,["222"])
            self.assertTrue(all("Cookie" not in headers and "Authorization" not in headers for _,headers in self.requests))

    def test_discord_unicode_filename_is_caption_not_storage_path(self):
        with tempfile.TemporaryDirectory() as root:
            events=self.job("discord",root,["222"],target="https://cdn.discordapp.com/attachments/111/222/%E6%97%A5%E6%9C%AC%E8%AA%9E.jpg")
            detail=next(e["data"] for e in events if e["event"]=="item_decision_required")
            self.assertEqual(detail["caption"],"\u65e5\u672c\u8a9e.jpg")
            self.assertTrue((Path(root)/"222.jpg").exists())

    def test_discord_wav_attachment_is_verified_and_recorded_as_audio(self):
        import wave
        output=io.BytesIO()
        with wave.open(output,"wb") as audio:
            audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(8000);audio.writeframes(b"\x00\x00"*800)
        self.payload=output.getvalue()
        with tempfile.TemporaryDirectory() as root:
            events=self.job("discord",root,["222"],target="https://cdn.discordapp.com/attachments/111/222/voice.wav")
            self.assertEqual(next(e["data"]["kind"] for e in events if e["event"]=="item_decision_required"),"audio")
            self.assertEqual((Path(root)/"222.wav").read_bytes(),self.payload)

    def test_adapters_reject_invalid_or_unscoped_account_cookies(self):
        for source in PUBLIC_SOURCES:
            with self.subTest(source=source),tempfile.TemporaryDirectory() as root,self.assertRaises(ConnectionFailure):
                execute(Worker(io.StringIO(),io.StringIO()),{"source":source,"target":TARGETS[source],"job_id":"bad","destination":root,"cookies":[{"name":"token","value":"fake"}]})
        self.assertEqual(self.requests,[])

    def test_existing_files_are_preserved_on_skip(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/"123456789_1.jpg"
            path.write_bytes(b"committed bytes")
            self.job("pinterest",root,["123456789_1"],False)
            self.assertEqual(path.read_bytes(),b"committed bytes")
            self.assertEqual([p for p,_ in self.requests],["/items"])

    def test_pinned_gallery_engines_match_approved_categories(self):
        from gallery_dl import extractor
        for source in ("pinterest","tiktok"):
            with self.subTest(source=source):
                extr=configure_gallery(source,canonical_public(source,TARGETS[source]),VideoSettings())
                self.assertEqual(extr.category,source)
                self.assertFalse(list(extr.session.cookies))

    def test_youtube_playlist_resolves_only_approved_video_ids_before_host_decisions(self):
        from http.cookiejar import CookieJar
        from social_downloader.browser_sessions import approve_session
        requests=[]
        class FakeYDL:
            def __init__(self,params):
                self.params=params
                self.cookiejar=CookieJar()
            def __enter__(self):
                return self
            def __exit__(self,*args):
                pass
            def extract_info(self,url,download=False):
                requests.append(("metadata",url))
                if "/playlist?" in url:
                    if url.endswith(("list=WL","list=LL")):
                        if not any(c.name=="SAPISID" and c.value=="synthetic-personal-playlist" for c in self.cookiejar):
                            raise AssertionError("The approved session did not reach playlist extraction.")
                    if self.params["noplaylist"]:
                        raise AssertionError("The playlist was disabled.")
                    return {"_type":"playlist","entries":[{"_type":"url","id":"AAAAAAAAAAA","url":"https://evil.test/private"},{"_type":"url","id":"BBBBBBBBBBB","url":"https://evil.test/another"}]}
                return {"id":url.split("v=")[1],"title":"Video","formats":[]}
            def process_ie_result(self,entry,download=True):
                requests.append(("transfer",entry["id"]))
                path=Path(self.params["outtmpl"]["default"].replace("%(ext)s","mp4"))
                path.write_bytes(b"synthetic media")
                return {"requested_downloads":[{"filepath":str(path)}]}
        for playlist in ("PL123456789012","WL","LL"):
            with self.subTest(playlist=playlist):
                requests.clear()
                cookies=[] if playlist.startswith("PL") else [{"name":"SAPISID","value":"synthetic-personal-playlist","domain":".youtube.com","path":"/","secure":True}]
                account=approve_session("youtube",cookies)["account_id"] if cookies else "public"
                target="https://www.youtube.com/playlist?list="+playlist
                frames=[{"command":"item_decision","job_id":"playlist","item_id":"AAAAAAAAAAA","transfer":False},{"command":"item_decision","job_id":"playlist","item_id":"BBBBBBBBBBB","transfer":True},{"command":"item_recorded","job_id":"playlist","item_id":"BBBBBBBBBBB"}]
                out=io.StringIO()
                for frame in frames:frame["protocol_version"]=1
                with tempfile.TemporaryDirectory() as root,patch("yt_dlp.YoutubeDL",FakeYDL),patch("social_downloader.previews.make_preview"),patch("social_downloader.video.process_video",side_effect=lambda path,settings:path),patch("social_downloader.playback.prepare_download_video"):
                    execute(Worker(io.StringIO("".join(json.dumps(f)+"\n" for f in frames)),out),{"source":"youtube","target":target,"job_id":"playlist","destination":root,"cookies":cookies,"account_id":account})
                    self.assertEqual(requests,[("metadata",target),("metadata","https://www.youtube.com/watch?v=AAAAAAAAAAA"),("metadata","https://www.youtube.com/watch?v=BBBBBBBBBBB"),("transfer","BBBBBBBBBBB")])
                    self.assertEqual(json.loads(out.getvalue().splitlines()[-1])["event"],"completed")

    def test_personal_playlists_without_browser_approval_never_probe_or_create_storage(self):
        for playlist in ("WL","LL"):
            with self.subTest(playlist=playlist),tempfile.TemporaryDirectory() as root,patch("social_downloader.public_downloads.video_download") as engine:
                target="https://www.youtube.com/playlist?list="+playlist
                destination=Path(root)/"not-created"
                with self.assertRaisesRegex(MediaFailure,"approved YouTube browser session"):
                    execute(Worker(io.StringIO(),io.StringIO()),{"source":"youtube","target":target,"job_id":"no-session","destination":str(destination),"cookies":[],"account_id":"public"})
                engine.assert_not_called()
                self.assertFalse(destination.exists())
        self.assertEqual(self.requests,[])

    def test_live_and_drm_videos_are_rejected_before_transfer(self):
        for flag in ({"is_live":True},{"live_status":"is_upcoming"},{"has_drm":True}):
            info={"id":"BaW_jenozKc","title":"Unavailable",**flag}
            with self.subTest(flag=flag),tempfile.TemporaryDirectory() as root,patch("social_downloader.test_support.public_video_fixture",return_value=info),self.assertRaisesRegex(MediaFailure,"Live broadcasts and protected media"):
                self.job("youtube",root,[])
        self.assertEqual(self.requests,[])

    def test_gallery_collection_cannot_expand_to_another_site(self):
        from gallery_dl.extractor.common import Extractor,Message
        import re
        class Fixture(Extractor):
            category="pinterest"
            subcategory="board"
            directory_fmt=()
            def _init(self):
                pass
            def items(self):
                yield Message.Queue,"https://evil.test/private",{}
        with tempfile.TemporaryDirectory() as root,patch("social_downloader.public_downloads.configure_gallery",return_value=Fixture(re.match(".*","fixture"))),self.assertRaisesRegex(MediaFailure,"outside its approved collection"):
            execute(Worker(io.StringIO(),io.StringIO()),{"source":"pinterest","target":"https://www.pinterest.com/example/board/","job_id":"scope","destination":root,"cookies":[]})
        self.assertEqual(self.requests,[])

if __name__=="__main__":
    unittest.main()
