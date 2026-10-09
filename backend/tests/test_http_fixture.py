from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest

from social_downloader.worker import Worker, fixture_bytes
from test_worker import frame


class HttpFixtureTests(unittest.TestCase):
    def test_repeat_performs_a_second_http_transfer_and_skip_performs_none(self):
        requests = []
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append(self.path)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'<svg xmlns="http://www.w3.org/2000/svg"/>')
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                for job, transfer in [("first", True), ("skip", False), ("repeat", True)]:
                    root = Path(directory) / job
                    incoming = frame("fixture_download", job_id=job, destination=str(root), download_mode="all_again" if job == "repeat" else "new_only",
                                     items=[{"id": "fixture-1", "url": f"http://127.0.0.1:{server.server_port}/fixture.svg"}])
                    incoming += frame("item_decision", job_id=job, item_id="fixture-1", transfer=transfer)
                    if transfer:
                        incoming += frame("item_recorded", job_id=job, item_id="fixture-1")
                    incoming += frame("shutdown")
                    output = io.StringIO()
                    self.assertEqual(Worker(io.StringIO(incoming), output).run(), 0)
                    self.assertEqual(json.loads(output.getvalue().splitlines()[-1])["event"], "completed")
                self.assertEqual(len(requests), 2)
                self.assertFalse((Path(directory) / "skip").exists())
                self.assertEqual((Path(directory) / "first/fixture-1.svg").read_bytes(), (Path(directory) / "repeat/fixture-1.svg").read_bytes())
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_fixture_network_access_is_limited_to_loopback(self):
        for value in ["https://example.com/", "http://localhost/", "http://127.0.0.1:80@evil.test/", "http://127.0.0.1/"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                fixture_bytes("fixture-1", value)
