from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from social_downloader.tools import find_tool, inspect_media


class ToolTests(unittest.TestCase):
    def test_successful_executable_check_is_cached_and_replacement_invalidates_it(self):
        import tempfile
        from social_downloader.tools import _valid,_validated
        _validated.cache_clear()
        try:
            with tempfile.TemporaryDirectory() as folder:
                tool=Path(folder)/"ffmpeg.exe";tool.write_bytes(b"fixture")
                with patch("social_downloader.tools.subprocess.run",return_value=subprocess.CompletedProcess([],0)) as run:
                    for _ in range(20):self.assertEqual(_valid(tool),str(tool.resolve()))
                    self.assertEqual(run.call_count,1)
                    tool.write_bytes(b"replacement fixture")
                    self.assertEqual(_valid(tool),str(tool.resolve()))
                    self.assertEqual(run.call_count,2)
        finally:_validated.cache_clear()

    @patch.dict("os.environ", {"SAVEDDESK_FFMPEG": ""})
    def test_broken_path_alias_falls_back_to_real_versioned_binary(self):
        good = str(Path("real-ffmpeg.exe").resolve())
        def run(command, **_):
            if command[0] == "broken-alias":
                raise OSError("alias cannot launch")
            return subprocess.CompletedProcess(command, 0, b"ffmpeg version test", b"")
        with patch("social_downloader.tools.shutil.which", return_value="broken-alias"), patch("imageio_ffmpeg.get_ffmpeg_exe", return_value=good), patch("social_downloader.tools.subprocess.run", side_effect=run):
            self.assertEqual(find_tool("ffmpeg"), good)

    def test_no_probe_is_unknown_not_audio_only(self):
        with patch("social_downloader.tools.find_tool", return_value=None):
            self.assertIsNone(inspect_media(Path("unknown.mp4")))

    def test_invalid_probe_output_is_unknown(self):
        with patch("social_downloader.tools.subprocess.run", return_value=subprocess.CompletedProcess([], 0, b"not JSON", b"")):
            self.assertIsNone(inspect_media(Path("unknown.mp4"), ffprobe="test-probe"))
