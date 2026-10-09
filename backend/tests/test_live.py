import io
import json
from pathlib import Path
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import unittest
from unittest.mock import patch

from social_downloader.live import execute, item_metadata, verify_image
from social_downloader.worker import Worker
from social_downloader.models import MediaFailure
from test_authentication import cookies


class LiveAdapterTests(unittest.TestCase):
    def test_gallery_movie_containers_take_video_finalization_path(self):
        for source in ("instagram", "x"):
            for extension in ("mp4", "mkv", "webm", "mov", "m4v", "avi"):
                with self.subTest(source=source, extension=extension):
                    detail=item_metadata(source,{"post_id":"42","media_id":"43","tweet_id":"42","num":1,"extension":extension})
                    self.assertEqual(detail["kind"],"video")

    def test_retry_after_129_assets_accepts_heic_hint_with_jpeg_bytes(self):
        self.entries = [{"post":str(i),"id":str(i)} for i in range(1,130)] + [
            {"post":"130","id":"130","extension":"heic"}, {"post":"131","id":"131"}]
        frames=[]
        for item in self.entries:
            transfer=int(item["id"]) >= 130
            frames.append({"protocol_version":1,"command":"item_decision","job_id":"resume","item_id":item["id"],"transfer":transfer})
            if transfer:
                frames.append({"protocol_version":1,"command":"item_recorded","job_id":"resume","item_id":item["id"]})
        output=io.StringIO()
        with tempfile.TemporaryDirectory() as folder, patch("social_downloader.previews.make_preview"):
            root=Path(folder)
            for i in range(1,130):
                (root/f"{i}.jpg").write_bytes(b"existing committed content")
            worker=Worker(io.StringIO("".join(json.dumps(f)+"\n" for f in frames)),output)
            execute(worker,{"source":"instagram","target":"https://www.instagram.com/fixture_user/saved/","job_id":"resume","destination":folder,"cookies":cookies(),"test_origin":self.origin})
            events=[json.loads(line) for line in output.getvalue().splitlines()]
            self.assertEqual(sum(e["event"] == "item_skipped" for e in events),129)
            self.assertEqual([e["data"]["relative_path"] for e in events if e["event"] == "item_completed"],["130.jpg","131.jpg"])
            self.assertEqual(events[-1]["event"],"completed")
            self.assertEqual(self.requests,["/items","/media/130","/media/131"])
            self.assertTrue(all((root/f"{i}.jpg").read_bytes() == b"existing committed content" for i in range(1,130)))
            verify_image(root/"130.jpg")
            self.assertFalse((root/"130.heic").exists())

    def test_genuine_heic_is_reported_without_stopping_later_images(self):
        self.entries=[{"post":"100","id":"101","extension":"heic"},{"post":"100","id":"102"}]
        self.media_payloads["/media/101"]=b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00synthetic-heic"
        output=io.StringIO()
        frames=[{"protocol_version":1,"command":"item_decision","job_id":"live-test","item_id":i,"transfer":True} for i in ["101","102"]]
        frames.append({"protocol_version":1,"command":"item_recorded","job_id":"live-test","item_id":"102"})
        with tempfile.TemporaryDirectory() as folder, patch("social_downloader.previews.make_preview"):
            worker=Worker(io.StringIO("".join(json.dumps(f)+"\n" for f in frames)),output)
            with self.assertRaisesRegex(MediaFailure,"unsupported media format"):
                execute(worker,{"source":"instagram","target":"https://www.instagram.com/fixture_user/saved/","job_id":"live-test","destination":folder,"cookies":cookies(),"test_origin":self.origin})
            events=[json.loads(line) for line in output.getvalue().splitlines()]
            self.assertEqual([e["data"]["item_id"] for e in events if e["event"] == "item_failed"],["101"])
            self.assertEqual([e["data"]["relative_path"] for e in events if e["event"] == "item_completed"],["102.jpg"])
            self.assertFalse((Path(folder)/"101.heic").exists())
            self.assertEqual(len(list(Path(folder).glob("*.rejected-*"))),1)
            self.assertFalse(any(e["event"] == "completed" for e in events))

    def test_unsupported_hint_is_skippable_and_does_not_abort_later_items(self):
        self.entries=[{"post":"100","id":"101","extension":"exe"},{"post":"100","id":"102"}]
        with tempfile.TemporaryDirectory() as folder:
            events=self.run_job(Path(folder)/"skip",False)
            self.assertEqual(events[-1]["event"],"completed")
            self.assertEqual(self.requests,["/items"])
            frames=[{"protocol_version":1,"command":"item_decision","job_id":"live-test","item_id":i,"transfer":True} for i in ["101","102"]]
            frames.append({"protocol_version":1,"command":"item_recorded","job_id":"live-test","item_id":"102"})
            worker=Worker(io.StringIO("".join(json.dumps(f)+"\n" for f in frames)),io.StringIO())
            with self.assertRaisesRegex(MediaFailure,"unsupported media format"):
                execute(worker,{"source":"instagram","target":"https://www.instagram.com/fixture_user/saved/","job_id":"live-test","destination":str(Path(folder)/"transfer"),"cookies":cookies(),"test_origin":self.origin})
            self.assertEqual(self.requests,["/items","/items","/media/102"])
            self.assertTrue((Path(folder)/"transfer/102.jpg").is_file())
            self.assertFalse((Path(folder)/"transfer/101.exe").exists())

    def test_real_engine_boundary_keeps_the_controlled_processing_failure(self):
        self.entries = [{"post":"400","id":"401","extension":"mp4"}]
        incoming = json.dumps({"protocol_version":1,"command":"item_decision","job_id":"video-test","item_id":"401","transfer":True})+"\n"
        message = "No source stream meets this resolution. Choose Compatible MP4 to create a smaller copy."
        with tempfile.TemporaryDirectory() as folder:
            worker = Worker(io.StringIO(incoming), io.StringIO())
            with patch("social_downloader.video.process_video", side_effect=MediaFailure(message)), self.assertRaisesRegex(MediaFailure, "Choose Compatible MP4"):
                execute(worker,{"source":"instagram","target":"https://www.instagram.com/p/video_fixture/","job_id":"video-test","destination":folder,"cookies":cookies(),"test_origin":self.origin})

    def test_video_failure_does_not_abort_later_collection_items(self):
        self.entries=[{"post":"400","id":"401","extension":"mp4"},{"post":"500","id":"501"}]
        frames=[{"protocol_version":1,"command":"item_decision","job_id":"batch","item_id":key,"transfer":True} for key in ["401","501"]]
        frames.append({"protocol_version":1,"command":"item_recorded","job_id":"batch","item_id":"501"})
        out=io.StringIO()
        with tempfile.TemporaryDirectory() as folder,patch("social_downloader.previews.make_preview"),patch("social_downloader.video.process_video",side_effect=MediaFailure("Video verification failed; retry this file.")):
            worker=Worker(io.StringIO("".join(json.dumps(frame)+"\n" for frame in frames)),out)
            with self.assertRaisesRegex(MediaFailure,"Video verification failed"):
                execute(worker,{"source":"instagram","target":"https://www.instagram.com/fixture_user/saved/","job_id":"batch","destination":folder,"cookies":cookies(),"test_origin":self.origin})
            events=[json.loads(line) for line in out.getvalue().splitlines()]
            self.assertEqual([e["data"]["item_id"] for e in events if e["event"]=="item_failed"],["401"])
            self.assertEqual([e["data"]["relative_path"] for e in events if e["event"]=="item_completed"],["501.jpg"])
            self.assertEqual(len(list(Path(folder).glob("401.*"))),1)
            self.assertTrue((Path(folder)/"501.jpg").is_file())

    def test_html_response_is_not_recorded_as_an_image(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"login.jpg";path.write_bytes(b"<html>please log in</html>")
            with self.assertRaises(ValueError):verify_image(path)
    def setUp(self):
        self.requests = []
        self.media_payloads = {}
        self.entries = [{"post":"100","id":"101"},{"post":"100","id":"102"}]
        owner = self
        requests = self.requests
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append(self.path)
                if self.path == "/viewer/instagram":
                    payload = json.dumps({"form_data":{"username":"fixture_user"}}).encode()
                else:
                    payload = json.dumps(owner.entries).encode() if self.path == "/items" else owner.media_payloads.get(self.path, b"\xff\xd8\xffsynthetic-image-content")
                self.send_response(429 if self.path.startswith("/profile/") else 200)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            def log_message(self, *args): pass
        self.server = ThreadingHTTPServer(("127.0.0.1",0),Handler)
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.origin = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()

    def run_job(self, destination, transfer):
        frames = []
        for identity in ["101","102"]:
            frames.append({"protocol_version":1,"command":"item_decision","job_id":"live-test","item_id":identity,"transfer":transfer})
            if transfer: frames.append({"protocol_version":1,"command":"item_recorded","job_id":"live-test","item_id":identity})
        output=io.StringIO()
        worker=Worker(io.StringIO("".join(json.dumps(frame)+"\n" for frame in frames)),output)
        execute(worker,{"source":"instagram","target":"https://www.instagram.com/fixture_user/saved/","job_id":"live-test","destination":str(destination),"cookies":cookies(),"test_origin":self.origin})
        return [json.loads(line) for line in output.getvalue().splitlines()]

    def test_real_gallery_downloader_skips_before_media_requests_and_repeats(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            first=self.run_job(root/"first",True)
            self.assertEqual(len([e for e in first if e["event"]=="item_completed"]),2)
            self.assertEqual([p for p in self.requests if p.startswith("/media/")],["/media/101","/media/102"])
            self.run_job(root/"skip",False)
            self.assertEqual(len([p for p in self.requests if p.startswith("/media/")]),2)
            self.assertEqual(list((root/"skip").iterdir()),[])
            self.run_job(root/"repeat",True)
            self.assertEqual(len([p for p in self.requests if p.startswith("/media/")]),4)
            self.assertEqual((root/"first/101.jpg").read_bytes(),(root/"repeat/101.jpg").read_bytes())

    def test_instagram_engine_preserves_approved_browser_identity_without_stale_hints(self):
        from social_downloader.live import configured_extractor
        agent="Mozilla/5.0 Chrome/154.0.0.0 Safari/537.36"
        extr=configured_extractor("instagram","https://www.instagram.com/fixture_user/saved/",cookies(),None,user_agent=agent)
        try:
            self.assertEqual(extr.session.headers["User-Agent"],agent)
            self.assertFalse(any(key.lower().startswith("sec-ch-ua") for key in extr.session.headers))
        finally:
            extr.session.close()

    def test_carousel_assets_share_a_post_identity(self):
        a=item_metadata("instagram",{"post_id":"100","media_id":"101","extension":"jpg"})
        b=item_metadata("instagram",{"post_id":"100","media_id":"102","extension":"mp4"})
        self.assertEqual(a["native_id"],b["native_id"])
        self.assertNotEqual(a["item_id"],b["item_id"])

    def test_x_text_only_posts_are_acknowledged_and_uncommitted_retries_preserve_copies(self):
        full_text = "A long saved text post. " * 300 + "Complete ending."
        self.entries = [{"post":"500","id":"500","extension":"txt","content":full_text}]
        session = [{"domain":".x.com","name":name,"value":"synthetic-session","path":"/","secure":True} for name in ("auth_token","ct0")]
        with tempfile.TemporaryDirectory() as folder:
            for attempt in range(2):
                frames = [{"protocol_version":1,"command":"item_decision","job_id":"text-test","item_id":"500_0","transfer":True},
                          {"protocol_version":1,"command":"item_recorded","job_id":"text-test","item_id":"500_0"}]
                output = io.StringIO()
                worker = Worker(io.StringIO("".join(json.dumps(frame)+"\n" for frame in frames)),output)
                execute(worker,{"source":"x","target":"https://x.com/i/bookmarks","job_id":"text-test","destination":folder,"cookies":session,"test_origin":self.origin})
                events = [json.loads(line) for line in output.getvalue().splitlines()]
                self.assertEqual(sum(e["event"] == "item_completed" for e in events), 1)
            saved = list(Path(folder).glob("*.txt"))
            self.assertEqual(len(saved), 2)
            self.assertTrue(all("https://x.com/fixture_user/status/500" in p.read_text() for p in saved))
            self.assertTrue(all(p.read_text().startswith(full_text) for p in saved))
            self.assertEqual([path for path in self.requests if path.startswith("/media/")], [])

    def test_completion_requires_ack_before_next_asset(self):
        with tempfile.TemporaryDirectory() as folder:
            worker=Worker(io.StringIO(json.dumps({"protocol_version":1,"command":"item_decision","job_id":"live-test","item_id":"101","transfer":True})+"\n"),io.StringIO())
            with self.assertRaises(ValueError):
                execute(worker,{"source":"instagram","target":"https://www.instagram.com/fixture_user/saved/","job_id":"live-test","destination":folder,"cookies":cookies(),"test_origin":self.origin})
            self.assertEqual([p for p in self.requests if p.startswith("/media/")],["/media/101"])


    def test_instagram_download_preflight_uses_single_verified_session_request(self):
        values=[{**cookies()[0],"value":"42%3Asynthetic_private_token%3A10%3Asynthetic_private_signature"},
                {**cookies()[0],"name":"ds_user_id","value":"42"}]
        frames=[{"protocol_version":1,"command":"item_decision","job_id":"session-test","item_id":item,"transfer":False} for item in ["101","102"]]
        output=io.StringIO()
        worker=Worker(io.StringIO("".join(json.dumps(frame)+"\n" for frame in frames)),output)
        with tempfile.TemporaryDirectory() as folder:
            execute(worker,{"source":"instagram","target":"https://www.instagram.com/fixture_user/saved/","job_id":"session-test","account_id":"42","destination":folder,"cookies":values,"test_origin":self.origin})
        self.assertEqual(self.requests,["/viewer/instagram","/items"])
        self.assertEqual(json.loads(output.getvalue().splitlines()[-1])["event"],"completed")
        self.assertNotIn("synthetic_private",output.getvalue())

    def test_instagram_download_preflight_rejects_changed_session_before_content_requests(self):
        from social_downloader.authentication import ConnectionFailure
        values=[{**cookies()[0],"value":"73%3Asynthetic_private_token%3A10%3Asynthetic_private_signature"},
                {**cookies()[0],"name":"ds_user_id","value":"73"}]
        output=io.StringIO()
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(ConnectionFailure,"browser account changed"):
            execute(Worker(io.StringIO(),output),{"source":"instagram","target":"https://www.instagram.com/fixture_user/saved/","job_id":"session-test","account_id":"42","destination":folder,"cookies":values,"test_origin":self.origin})
        self.assertEqual(self.requests,["/viewer/instagram"])
        self.assertEqual(output.getvalue(),"")


if __name__ == "__main__": unittest.main()
