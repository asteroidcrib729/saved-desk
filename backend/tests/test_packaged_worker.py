import json
import os
import sys
from pathlib import Path
import subprocess
import tempfile
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading

from test_worker import frame

EXECUTABLE = Path(__file__).resolve().parents[2] / "desktop/src-tauri/resources/worker/saveddesk-worker.exe"


@unittest.skipUnless(EXECUTABLE.is_file(), "Build the worker package first.")
class PackagedWorkerTests(unittest.TestCase):
    def test_packaged_browser_approval_is_opaque_and_not_remote_account_verification(self):
        from test_browser_sessions_progress import entries
        environment={k:v for k,v in os.environ.items() if k not in ("PYTHONPATH","PYTHONHOME","VIRTUAL_ENV")}
        for source in ("youtube","facebook","tiktok","pinterest"):
            with self.subTest(source=source):
                result=subprocess.run([str(EXECUTABLE)],input=frame("approve_browser_session",source=source,cookies=entries(source))+frame("shutdown"),text=True,capture_output=True,env=environment,timeout=30,creationflags=subprocess.CREATE_NO_WINDOW if os.name=="nt" else 0)
                self.assertEqual(result.returncode,0,result.stderr)
                rows=[json.loads(line) for line in result.stdout.splitlines()]
                self.assertEqual(rows[1]["event"],"browser_session_ready")
                self.assertEqual(rows[1]["data"]["state"],"session_ready")
                self.assertRegex(rows[1]["data"]["account_id"],r"^session_[0-9a-f]{64}$")
                self.assertNotIn("synthetic-",result.stdout+result.stderr)

    def test_packaged_resume_after_129_assets_corrects_heic_hint_before_completion(self):
        calls=[]
        entries=[{"post":str(i),"id":str(i)} for i in range(1,130)] + [
            {"post":"130","id":"130","extension":"heic"},{"post":"131","id":"131"}]
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                calls.append(self.path)
                payload=json.dumps(entries).encode() if self.path == "/items" else b"\xff\xd8\xffsynthetic-jpeg-response"
                self.send_response(200)
                self.send_header("Content-Length",str(len(payload)))
                self.end_headers();self.wfile.write(payload)
            def log_message(self,*args): pass
        server=HTTPServer(("127.0.0.1",0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory)
                for i in range(1,130):
                    (root/f"{i}.jpg").write_bytes(b"existing committed content")
                values=[{"domain":".instagram.com","name":"sessionid","value":"synthetic-private-cookie","path":"/","secure":True}]
                incoming=frame("live_download",source="instagram",target="https://www.instagram.com/fixture_user/saved/",job_id="resume",destination=directory,cookies=values,test_origin=f"http://127.0.0.1:{server.server_port}")
                for item in entries:
                    transfer=int(item["id"]) >= 130
                    incoming += frame("item_decision",job_id="resume",item_id=item["id"],transfer=transfer)
                    if transfer:
                        incoming += frame("item_recorded",job_id="resume",item_id=item["id"])
                incoming += frame("shutdown")
                environment={k:v for k,v in os.environ.items() if k not in ("PYTHONPATH","PYTHONHOME","VIRTUAL_ENV")}
                environment["SAVEDDESK_GALLERY_PYTHON"]=sys.executable
                result=subprocess.run([str(EXECUTABLE)],input=incoming,capture_output=True,text=True,encoding="utf-8",timeout=30,cwd=directory,env=environment)
                self.assertEqual(result.returncode,0,result.stderr)
                events=[json.loads(line) for line in result.stdout.splitlines()]
                self.assertEqual(sum(e["event"] == "item_skipped" for e in events),129)
                self.assertEqual([e["data"]["relative_path"] for e in events if e["event"] == "item_completed"],["130.jpg","131.jpg"])
                self.assertEqual(events[-1]["event"],"completed")
                self.assertEqual(calls,["/items","/media/130","/media/131"])
                self.assertTrue(all((root/f"{i}.jpg").read_bytes() == b"existing committed content" for i in range(1,130)))
                self.assertFalse((root/"130.heic").exists())
                self.assertNotIn("synthetic-private-cookie",result.stdout+result.stderr)
        finally:
            server.shutdown();server.server_close();thread.join(timeout=2)


    def test_packaged_worker_without_pythonpath_records_and_exits(self):
        with tempfile.TemporaryDirectory() as directory:
            incoming = frame("fixture_download", job_id="packaged", destination=directory,
                             download_mode="all_again", items=[{"id": "fixture-1"}])
            incoming += frame("item_decision", job_id="packaged", item_id="fixture-1", transfer=True)
            incoming += frame("item_recorded", job_id="packaged", item_id="fixture-1")
            incoming += frame("shutdown")
            environment = {key: value for key, value in os.environ.items() if key not in ("PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV")}
            result = subprocess.run([str(EXECUTABLE)], input=incoming, capture_output=True, text=True,
                                    encoding="utf-8", timeout=20, cwd=directory, env=environment)
            self.assertEqual(result.returncode, 0, result.stderr)
            events = [json.loads(line) for line in result.stdout.splitlines()]
            self.assertEqual(events[0]["event"], "hello")
            self.assertEqual(events[-1]["event"], "completed")
            self.assertTrue((Path(directory) / "fixture-1.svg").is_file())

    def verify_packaged_x(self, primary_status, body=None, hint=None, source="x", user_agent=None, by_id=False, require_state=False, standard_session=False):
        calls=[]
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                calls.append(self.path)
                invalid_state = require_state and self.path.startswith("/profile/") and (self.headers.get("X-IG-WWW-Claim") != "synthetic-private-claim")
                self.send_response(400 if invalid_state or (user_agent and self.headers.get("User-Agent") != user_agent) else primary_status)
                if require_state and self.path.startswith("/viewer/"):
                    self.send_header("x-ig-set-www-claim","synthetic-private-claim")
                    self.send_header("Set-Cookie","csrftoken=synthetic-rotated-csrf; Path=/")
                self.send_header("Content-Type","application/json");self.end_headers()
                payload={"user":{"pk":42,"username":"fixture_user"}} if by_id and self.path=="/profile/instagram/by-id/42" else body if body is not None else {"message":"private-server-message"}
                self.wfile.write(json.dumps(payload).encode())
            def log_message(self,*args): pass
        server=HTTPServer(("127.0.0.1",0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                values=[{"domain":".x.com" if source=="x" else ".instagram.com","name":name,"value":"synthetic-private-cookie","path":"/","secure":True} for name in (["auth_token","ct0"] if source=="x" else ["sessionid"])]
                if standard_session:
                    values[0]["value"]="42%3Asynthetic_private_token%3A10%3Asynthetic_private_signature"
                    values.append({**values[0],"name":"ds_user_id","value":"42"})
                if by_id:
                    values.append({**values[0],"name":"ds_user_id","value":"42"})
                if hint:
                    values.append({**values[0],"name":"twid","value":hint})
                incoming=frame("verify_account",source=source,cookies=values,user_agent=user_agent,test_origin=f"http://127.0.0.1:{server.server_port}")+frame("shutdown")
                environment={key:value for key,value in os.environ.items() if key not in ("PYTHONPATH","PYTHONHOME","VIRTUAL_ENV")}
                environment["SAVEDDESK_GALLERY_PYTHON"]=sys.executable
                result=subprocess.run([str(EXECUTABLE)],input=incoming,capture_output=True,text=True,encoding="utf-8",timeout=25,cwd=directory,env=environment)
                self.assertNotIn("synthetic-private-cookie",result.stdout+result.stderr)
                self.assertNotIn("private-server-message",result.stdout+result.stderr)
                return result,[json.loads(line) for line in result.stdout.splitlines()],calls
        finally:
            server.shutdown();server.server_close();thread.join(timeout=2)

    def test_packaged_x_signed_in_list_verifies_the_selected_account(self):
        result,events,calls=self.verify_packaged_x(200,{"users":[{"user_id":"99","screen_name":"other_account"},{"user_id":"73","screen_name":"fixture_x"}]},"u%3D73")
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(events[-1]["event"],"account_verified")
        self.assertEqual(events[-1]["data"],{"account_id":"73","username":"fixture_x"})
        self.assertEqual(calls,["/viewer/x"])

    def test_packaged_rate_limit_is_reported_without_additional_platform_requests(self):
        result,events,calls=self.verify_packaged_x(429)
        self.assertEqual(result.returncode,1)
        self.assertEqual(events[-1]["event"],"failed")
        self.assertIn("HTTP 429",events[-1]["data"]["message"])
        self.assertEqual(calls,["/viewer/x"])

    def test_packaged_x_missing_route_does_not_retry_known_dead_endpoints(self):
        result,events,calls=self.verify_packaged_x(404)
        self.assertEqual(result.returncode,1)
        self.assertEqual(events[-1]["event"],"failed")
        self.assertIn("HTTP 404",events[-1]["data"]["message"])
        self.assertEqual(calls,["/viewer/x"])

    def test_packaged_x_ambiguous_accounts_are_not_marked_connected(self):
        result,events,calls=self.verify_packaged_x(200,{"users":[{"user_id":"99","screen_name":"other_account"},{"user_id":"73","screen_name":"fixture_x"}]})
        self.assertEqual(result.returncode,1)
        self.assertEqual(events[-1]["event"],"failed")
        self.assertIn("active account",events[-1]["data"]["message"])
        self.assertEqual(calls,["/viewer/x"])

    def test_packaged_instagram_reports_client_mismatch_and_preserves_browser_identity(self):
        result,events,calls=self.verify_packaged_x(429,{"message":"useragent mismatch","private":"private-server-message"},source="instagram",user_agent="Mozilla/5.0 Chrome/154.0.0.0 Safari/537.36")
        self.assertEqual(result.returncode,1)
        self.assertEqual(events[-1]["event"],"failed")
        self.assertIn("HTTP 429: useragent mismatch",events[-1]["data"]["message"])
        self.assertEqual(calls,["/viewer/instagram"])

    def test_packaged_instagram_verifies_with_approved_browser_identity(self):
        result,events,calls=self.verify_packaged_x(200,{"form_data":{"user_id":"42","username":"fixture_user"}},source="instagram",user_agent="Mozilla/5.0 Chrome/154.0.0.0 Safari/537.36")
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(events[-1]["event"],"account_verified")
        self.assertEqual(events[-1]["data"],{"account_id":"42","username":"fixture_user"})
        self.assertEqual(calls,["/viewer/instagram"])

    def test_packaged_instagram_avoids_username_lookup_and_binds_browser_id_to_server_identity(self):
        result,events,calls=self.verify_packaged_x(200,{"form_data":{"username":"fixture_user"}},source="instagram",user_agent="Mozilla/5.0 Chrome/154.0.0.0 Safari/537.36",by_id=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(events[-1]["data"],{"account_id":"42","username":"fixture_user"})
        self.assertEqual(calls,["/viewer/instagram","/profile/instagram/by-id/42"])

    def test_packaged_instagram_retains_provider_claim_for_lookup(self):
        result,events,calls=self.verify_packaged_x(200,{"form_data":{"username":"fixture_user"}},source="instagram",by_id=True,require_state=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(events[-1]["data"],{"account_id":"42","username":"fixture_user"})
        self.assertNotIn("synthetic-private-claim",result.stdout+result.stderr)
        self.assertNotIn("synthetic-rotated-csrf",result.stdout+result.stderr)
        self.assertEqual(calls,["/viewer/instagram","/profile/instagram/by-id/42"])

    def test_packaged_instagram_standard_session_needs_only_authenticated_settings(self):
        result,events,calls=self.verify_packaged_x(200,{"form_data":{"username":"fixture_user"}},source="instagram",standard_session=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(events[-1]["data"],{"account_id":"42","username":"fixture_user"})
        self.assertEqual(calls,["/viewer/instagram"])
        self.assertNotIn("synthetic_private",result.stdout+result.stderr)

    def test_packaged_instagram_standard_session_rejection_never_connects_or_retries(self):
        result,events,calls=self.verify_packaged_x(429,source="instagram",standard_session=True)
        self.assertEqual(result.returncode,1)
        self.assertEqual(events[-1]["event"],"failed")
        self.assertIn("account verification (HTTP 429)",events[-1]["data"]["message"])
        self.assertEqual(calls,["/viewer/instagram"])
        self.assertNotIn("synthetic_private",result.stdout+result.stderr)
