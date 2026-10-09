import io
import json
import math
import time
import unittest
from unittest.mock import patch
from social_downloader.authentication import ConnectionFailure, cookie_jar
from social_downloader.browser_sessions import approve_session
from social_downloader.progress import Progress
from social_downloader.worker import Worker

COOKIES = {"youtube": {"SAPISID":"synthetic-youtube"},"facebook":{"c_user":"12345","xs":"synthetic-facebook"},"tiktok":{"sessionid":"synthetic-tiktok"},"pinterest":{"_pinterest_sess":"synthetic-pinterest","_auth":"1"}}
def entries(source):
    return [{"name":name,"value":value,"domain":"."+source+".com","path":"/","secure":True,"httpOnly":True} for name,value in COOKIES[source].items()]

class BrowserSessionsAndProgressTests(unittest.TestCase):
    def test_approved_sessions_are_scoped_opaque_and_not_verified_accounts(self):
        for source in COOKIES:
            with self.subTest(source=source):
                cookies=entries(source)
                result=approve_session(source,cookies)
                self.assertEqual(result["state"],"session_ready")
                self.assertEqual(result["username"],"BrowserSession")
                self.assertRegex(result["account_id"],r"^session_[0-9a-f]{64}$")
                self.assertEqual(result,approve_session(source,list(reversed(cookies))))
                for c in cookies:
                    if len(c["value"])>=8:self.assertNotIn(c["value"],json.dumps(result))
                cookies[0]["value"] += "-changed"
                self.assertNotEqual(result["account_id"],approve_session(source,cookies)["account_id"])
    def test_other_site_expired_partition_and_guest_sessions_are_rejected(self):
        for source in COOKIES:
            for extra in ({"domain":".evil.test"},{"expirationDate":time.time()-1},{"partitionKey":{"topLevelSite":"https://evil.test"}}):
                with self.subTest(source=source,extra=extra), self.assertRaises(ConnectionFailure):
                    cookies=entries(source);cookies[0].update(extra);approve_session(source,cookies)
        for source in ("reddit","discord","unsupported"):
            with self.assertRaises(ConnectionFailure):approve_session(source,entries("youtube"))
        cookies=entries("pinterest");cookies[-1]["value"]="0"
        with self.assertRaises(ConnectionFailure):approve_session("pinterest",cookies)
    def test_youtube_session_stays_in_engine_memory_and_same_origin(self):
        from yt_dlp import YoutubeDL
        with YoutubeDL({"quiet":True,"cachedir":False}) as ydl:
            for cookie in cookie_jar("youtube",entries("youtube")):ydl.cookiejar.set_cookie(cookie)
            self.assertIn("SAPISID",ydl.cookiejar.get_cookie_header("https://www.youtube.com/watch?v=BaW_jenozKc"))
            self.assertFalse(ydl.cookiejar.get_cookie_header("https://www.google.com/"))
            self.assertFalse(ydl.cookiejar.get_cookie_header("https://youtube.com.evil.test/"))
    def test_private_session_mismatch_stops_before_engine_or_network(self):
        from social_downloader.public_downloads import execute
        from social_downloader.models import MediaFailure
        with patch("social_downloader.public_downloads.video_download") as engine, self.assertRaises(MediaFailure):
            execute(Worker(io.StringIO(),io.StringIO()),{"source":"youtube","job_id":"bad","target":"https://www.youtube.com/watch?v=BaW_jenozKc","cookies":entries("youtube"),"account_id":"session_"+"0"*64,"destination":"unused"})
        engine.assert_not_called()
    def test_progress_throttles_unknown_totals_and_strips_private_fields(self):
        output=io.StringIO();worker=Worker(io.StringIO(),output);progress=Progress(worker,"job")
        progress.begin("asset");progress.last=0
        with patch("social_downloader.progress.time.monotonic",side_effect=[100.,100.1,100.3,101.,102.]):
            progress.update(10,100)
            progress.update(20,100)
            progress.update(30,100)
            progress.hook({"status":"downloading","downloaded_bytes":40,"total_bytes_estimate":80,"filename":"secret-path","url":"secret-url"})
            progress.hook({"status":"finished"})
        rows=[json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(rows),5)
        self.assertEqual(rows[1]["data"]["total"],100)
        self.assertEqual(rows[3]["data"]["total"],None)
        self.assertEqual(rows[-1]["data"]["phase"],"processing")
        self.assertNotIn("secret",output.getvalue())
    def test_progress_rejects_invalid_counters_and_never_invents_percentages(self):
        output=io.StringIO();progress=Progress(Worker(io.StringIO(),output),"job");progress.begin("asset")
        for value in (-1,True,math.nan,math.inf,11*1024**4):progress.update(value,100,force=True)
        self.assertEqual(len(output.getvalue().splitlines()),1)
        progress.update(200,100,force=True)
        self.assertIsNone(json.loads(output.getvalue().splitlines()[-1])["data"]["total"])
    def test_worker_approval_returns_no_credentials(self):
        command={"protocol_version":1,"command":"approve_browser_session","source":"facebook","cookies":entries("facebook")}
        output=io.StringIO();worker=Worker(io.StringIO(json.dumps(command)+"\n"),output)
        self.assertEqual(worker.run(),0)
        self.assertIn('"browser_session_ready"',output.getvalue())
        self.assertNotIn("synthetic-facebook",output.getvalue())
        self.assertNotIn('"account_verified"',output.getvalue())
