from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from social_downloader.tools import find_tool
from social_downloader.video import encode_fixture, process_video
from social_downloader.models import VideoSettings
from social_downloader.previews import make_preview


class VideoTests(unittest.TestCase):
    def test_thumbnail_is_bounded_and_original_is_preserved(self):
        if not find_tool("ffmpeg"):
            self.skipTest("FFmpeg is required.")
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "original.mp4"
            encode_fixture(source)
            original = source.read_bytes()
            make_preview(source)
            preview = source.parent / ".previews" / "original.mp4.jpg"
            self.assertTrue(preview.read_bytes().startswith(b"\xff\xd8\xff"))
            self.assertLessEqual(preview.stat().st_size, 65536)
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(len(list(preview.parent.iterdir())), 1)

    def test_current_preview_is_reused_and_modified_source_is_refreshed(self):
        import os
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"video.mp4";encode_fixture(source);make_preview(source)
            preview=source.parent/".previews"/"video.mp4.jpg"
            with patch("social_downloader.previews.find_tool") as tool:
                make_preview(source);tool.assert_not_called()
            modified=preview.stat().st_mtime_ns+1000000
            os.utime(source,ns=(modified,modified))
            with patch("social_downloader.previews.find_tool",return_value=None) as tool:
                make_preview(source);tool.assert_called_once()

    def test_unavailable_preview_directory_does_not_fail_the_download(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "original.jpg"
            source.write_bytes(b"original")
            (source.parent / ".previews").write_bytes(b"occupied")
            with patch("social_downloader.previews.find_tool", return_value="encoder"):
                make_preview(source)
            self.assertEqual(source.read_bytes(), b"original")

    def test_real_conversion_replaces_source_only_after_verification_and_caps_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/"original.mp4";encode_fixture(source)
            original=source.read_bytes()
            with self.assertRaises(ValueError): process_video(source,VideoSettings(480,"original"))
            self.assertEqual(source.read_bytes(),original)
            converted=process_video(source,VideoSettings(480,"compatible_mp4"))
            self.assertEqual(converted,source)
            self.assertNotEqual(source.read_bytes(),original)
            self.assertEqual(process_video(converted,VideoSettings(480,"original")),converted)
            self.assertEqual(len(list(Path(directory).glob("*.mp4"))),1)

    def test_video_fixture_is_encoded_and_decodable(self):
        if not find_tool("ffmpeg"):
            self.skipTest("The encoding feasibility gate requires FFmpeg.")
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "fixture.mp4"
            result = encode_fixture(output)
            self.assertGreater(result["bytes"], 0)
            self.assertEqual(result["codec"], "h264")
            self.assertTrue(result["decoded"])
            self.assertEqual(list(Path(directory).glob("*.partial.mp4")), [])

    def test_missing_encoder_preserves_existing_source(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "original.mp4"
            source.write_bytes(b"original")
            with patch("social_downloader.video.find_tool", return_value=None), self.assertRaises(ValueError):
                encode_fixture(Path(directory) / "derived.mp4")
            self.assertEqual(source.read_bytes(), b"original")

    def test_existing_destination_is_never_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "fixture.mp4"
            output.write_bytes(b"original")
            with patch("social_downloader.video.find_tool", return_value="encoder"), self.assertRaises(ValueError):
                encode_fixture(output)
            self.assertEqual(output.read_bytes(), b"original")
