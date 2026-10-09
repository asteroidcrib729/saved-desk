import io
import json
from pathlib import Path
import tempfile
import unittest
import tomllib
from unittest.mock import patch

from social_downloader.models import MAX_FRAME_BYTES, MediaFailure, VideoSettings, canonical_target, contained_path, source_format
from social_downloader.worker import Worker


def frame(command, **values):
    return json.dumps({"protocol_version": 1, "command": command, **values}) + "\n"


def execute_fixture(root, job="first", transfer=True):
    incoming = frame("fixture_download", job_id=job, destination=str(root), download_mode="new_only", items=[{"id": "fixture-1"}])
    incoming += frame("item_decision", job_id=job, item_id="fixture-1", transfer=transfer)
    if transfer:
        incoming += frame("item_recorded", job_id=job, item_id="fixture-1")
    incoming += frame("shutdown")
    outgoing = io.StringIO()
    result = Worker(io.StringIO(incoming), outgoing).run()
    return result, [json.loads(line) for line in outgoing.getvalue().splitlines()]


class WorkerTests(unittest.TestCase):
    def test_worker_greeting_matches_the_packaged_project_version(self):
        expected = tomllib.loads((Path(__file__).resolve().parents[1] / "pyproject.toml").read_text())["project"]["version"]
        output = io.StringIO()
        self.assertEqual(Worker(io.StringIO(frame("shutdown")), output).run(), 0)
        greeting = json.loads(output.getvalue().splitlines()[0])
        self.assertEqual(greeting["event"], "hello")
        self.assertEqual(greeting["data"]["worker_version"], expected)

    def test_preview_helper_is_bounded_and_validates_all_paths_before_work(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/"photo.jpg").write_bytes(b"image");(root/"other.jpg").write_bytes(b"image")
            output=io.StringIO()
            with patch("social_downloader.previews.make_preview") as preview:
                request=frame("generate_previews",destination=folder,files=["photo.jpg","other.jpg"])+frame("shutdown")
                self.assertEqual(Worker(io.StringIO(request),output).run(),0)
                self.assertEqual([call.args[0] for call in preview.call_args_list],[(root/"photo.jpg").resolve(),(root/"other.jpg").resolve()])
            self.assertEqual([json.loads(line)["event"] for line in output.getvalue().splitlines()],["hello","preview_progress","preview_progress","previews_completed"])
            for paths in [["photo.jpg","../outside.jpg"],[str(root/"photo.jpg")],["photo.jpg"]*19,[]]:
                with patch("social_downloader.previews.make_preview") as preview:
                    self.assertEqual(Worker(io.StringIO(frame("generate_previews",destination=folder,files=paths)),io.StringIO()).run(),1)
                    preview.assert_not_called()


    def test_controlled_video_errors_keep_the_actionable_message_and_processing_category(self):
        output = io.StringIO()
        request = frame("live_download", job_id="video", source="instagram")
        message = "No source stream meets this resolution. Choose Compatible MP4 to create a smaller copy."
        with patch("social_downloader.live.execute", side_effect=MediaFailure(message)):
            self.assertEqual(Worker(io.StringIO(request), output).run(), 1)
        failure = json.loads(output.getvalue().splitlines()[-1])
        self.assertEqual(failure["data"]["category"], "processing")
        self.assertEqual(failure["data"]["message"], message)

    def test_completion_follows_approved_transfer_and_ack(self):
        with tempfile.TemporaryDirectory() as directory:
            result, events = execute_fixture(Path(directory))
            self.assertEqual(result, 0)
            self.assertEqual([event["event"] for event in events], ["hello", "started", "item_decision_required", "item_completed", "completed"])
            self.assertEqual([event["sequence"] for event in events], list(range(1, 6)))
            self.assertEqual((Path(directory) / "fixture-1.svg").stat().st_size, events[3]["data"]["bytes_written"])

    def test_skip_does_not_create_a_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "not-created"
            result, events = execute_fixture(target, transfer=False)
            self.assertEqual(result, 0)
            self.assertFalse(target.exists())
            self.assertEqual(events[3]["event"], "item_skipped")

    def test_repeat_creates_a_second_copy_and_preserves_original(self):
        with tempfile.TemporaryDirectory() as directory:
            first, repeat = Path(directory) / "first", Path(directory) / "repeat"
            self.assertEqual(execute_fixture(first)[0], 0)
            original = (first / "fixture-1.svg").read_bytes()
            self.assertEqual(execute_fixture(repeat, job="repeat")[0], 0)
            self.assertEqual((first / "fixture-1.svg").read_bytes(), original)
            self.assertEqual((repeat / "fixture-1.svg").read_bytes(), original)

    def test_collision_does_not_overwrite_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "fixture-1.svg"
            target.write_text("original")
            result, events = execute_fixture(Path(directory))
            self.assertEqual(result, 1)
            self.assertEqual(target.read_text(), "original")
            self.assertEqual(events[-1]["event"], "failed")
            self.assertFalse(list(Path(directory).glob("*.partial")))

    def test_missing_ack_never_announces_job_completion(self):
        with tempfile.TemporaryDirectory() as directory:
            incoming = frame("fixture_download", job_id="job", destination=directory, download_mode="new_only", items=[{"id": "fixture-1"}])
            incoming += frame("item_decision", job_id="job", item_id="fixture-1", transfer=True)
            incoming += frame("shutdown")
            output = io.StringIO()
            self.assertEqual(Worker(io.StringIO(incoming), output).run(), 1)
            self.assertNotIn('"event":"completed"', output.getvalue())

    def test_cancellation_before_decision_transfers_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            incoming = frame("fixture_download", job_id="job", destination=directory, download_mode="new_only", items=[{"id": "fixture-1"}])
            incoming += frame("cancel", job_id="job") + frame("shutdown")
            output = io.StringIO()
            self.assertEqual(Worker(io.StringIO(incoming), output).run(), 0)
            self.assertEqual(list(Path(directory).iterdir()), [])
            self.assertIn('"event":"cancelled"', output.getvalue())

    def test_unknown_protocol_and_oversized_requests_are_rejected(self):
        for invalid in ['{"protocol_version":99,"command":"shutdown"}\n', '{"protocol_version":true,"command":"shutdown"}\n', "x" * (MAX_FRAME_BYTES + 1) + "\n", "[]\n"]:
            with self.subTest(invalid=invalid[:40]):
                output = io.StringIO()
                self.assertEqual(Worker(io.StringIO(invalid), output).run(), 1)
                self.assertIn('"category":"invalid_request"', output.getvalue())

    def test_string_transfer_approval_is_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            incoming = frame("fixture_download", job_id="job", destination=directory, download_mode="new_only", items=[{"id": "fixture-1"}])
            incoming += frame("item_decision", job_id="job", item_id="fixture-1", transfer="false")
            output = io.StringIO()
            self.assertEqual(Worker(io.StringIO(incoming), output).run(), 1)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_paths_cannot_escape_the_approved_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for value in ["../outside", str(root.parent / "outside"), "."]:
                with self.assertRaises(ValueError):
                    contained_path(root, value)


class SettingsTests(unittest.TestCase):
    def test_platform_aliases_normalize_without_tracking_queries(self):
        self.assertEqual(canonical_target("x", "https://twitter.com/i/bookmarks?tracking=1"), "https://x.com/i/bookmarks")
        self.assertEqual(canonical_target("instagram", "https://instagram.com/person/saved/collection/123/"), "https://www.instagram.com/person/saved/collection/123/")

    def test_instagram_reels_alias_identifies_the_same_post(self):
        self.assertEqual(canonical_target("instagram", "https://www.instagram.com/reels/Dd6qbtPRCnt/?igsh=tracking"), "https://www.instagram.com/reel/Dd6qbtPRCnt/")
        for target in ["https://instagram.com.evil.test/reels/Dd6qbtPRCnt/", "https://www.instagram.com/reels/", "https://www.instagram.com/reels/a/extra"]:
            with self.subTest(target=target), self.assertRaises(ValueError):
                canonical_target("instagram", target)

    def test_invalid_domains_and_unrelated_targets_are_rejected(self):
        for value in ["https://x.com.attacker.test/i/bookmarks", "http://x.com/i/bookmarks", "https://user:pass@x.com/i/bookmarks", "https://x.com/home", "https://x.com:443/i/bookmarks"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                canonical_target("x", value)

    def test_resolution_never_adds_an_unbounded_fallback(self):
        for resolution in [360, 480, 720, 1080, 1440, 2160]:
            with self.subTest(resolution=resolution):
                settings = VideoSettings(resolution=resolution)
                self.assertNotIn("bestvideo", source_format(settings, can_merge=False))
                for branch in source_format(settings, can_merge=True).split("/"):
                    self.assertIn(f"[height<={resolution}]", branch)
        with self.assertRaises(ValueError):
            VideoSettings(resolution=True)


if __name__ == "__main__":
    unittest.main()
