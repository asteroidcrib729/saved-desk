import hashlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from social_downloader.playback import prepare_playback
from social_downloader.tools import find_tool
from social_downloader.video import encode_fixture

class PlaybackTests(unittest.TestCase):
    def test_original_h264_is_not_converted_and_force_preserves_source(self):
        if not find_tool("ffmpeg"): self.skipTest("FFmpeg required")
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/"video.mp4";encode_fixture(source)
            original=hashlib.sha256(source.read_bytes()).digest()
            self.assertFalse(prepare_playback(root,"video.mp4",".playback/1-100-100.mp4"))
            self.assertFalse((root/".playback").exists())
            self.assertTrue(prepare_playback(root,"video.mp4",".playback/1-100-100.mp4",True))
            self.assertEqual(hashlib.sha256(source.read_bytes()).digest(),original)
            self.assertGreater((root/".playback/1-100-100.mp4").stat().st_size,0)
            self.assertEqual(list((root/".playback").glob("*.partial.mp4")),[])

    def test_vp9_mp4_is_converted_to_h264(self):
        encoder=find_tool("ffmpeg")
        if not encoder:self.skipTest("FFmpeg required")
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/"video.mp4"
            flags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0
            subprocess.run([encoder,"-nostdin","-v","error","-f","lavfi","-i","testsrc2=s=160x240:d=1","-c:v","libvpx-vp9","-threads","1",str(source)],check=True,capture_output=True,creationflags=flags)
            original=source.read_bytes()
            self.assertTrue(prepare_playback(root,"video.mp4",".playback/2-100-100.mp4"))
            target=root/".playback/2-100-100.mp4"
            result=subprocess.run([encoder,"-hide_banner","-i",str(target)],capture_output=True,creationflags=flags)
            self.assertIn(b"Video: h264",result.stderr)
            self.assertEqual(source.read_bytes(),original)

    def test_paths_and_destination_are_validated_before_work(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/"video.mp4").write_bytes(b"video")
            for relative,output in [("../outside.mp4",".playback/1-1-1.mp4"),("video.mp4","../outside.mp4"),("video.mp4","video.mp4"),("video.mp4",".playback/untrusted.mp4"),(str(root/"video.mp4"),".playback/1-1-1.mp4")]:
                with self.subTest(relative=relative,output=output), patch("social_downloader.playback.find_tool") as tool:
                    with self.assertRaises((ValueError,OSError)):prepare_playback(root,relative,output)
                    tool.assert_not_called()
            self.assertEqual((root/"video.mp4").read_bytes(),b"video")

class DownloadReadinessTests(unittest.TestCase):
    def test_ready_h264_needs_no_copy_and_original_is_unchanged(self):
        from social_downloader.playback import prepare_download_video, download_cache
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"ready.mp4";encode_fixture(source);before=source.read_bytes()
            prepare_download_video(source)
            self.assertFalse(download_cache(source).exists());self.assertEqual(source.read_bytes(),before)

    def test_vp9_is_prepared_before_completion_and_reused_without_reencoding(self):
        import io,json
        from social_downloader.public_downloads import Transfer
        from social_downloader.worker import Worker
        from social_downloader.models import VideoSettings
        from social_downloader.playback import download_cache,prepare_download_video
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/"unsupported.mp4";encoder=find_tool("ffmpeg")
            flags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0
            subprocess.run([encoder,"-nostdin","-v","error","-f","lavfi","-i","testsrc2=s=160x240:d=1","-c:v","libvpx-vp9","-threads","1",str(source)],check=True,capture_output=True,creationflags=flags)
            original=source.read_bytes();out=io.StringIO()
            class ReadyWorker(Worker):
                def emit(self,event,*args,**kwargs):
                    if event=="item_completed":
                        self_test.assertTrue(source.is_file())
                        self_test.assertNotEqual(source.read_bytes(), original)
                        self_test.assertFalse((root/".playback").exists())
                    return super().emit(event,*args,**kwargs)
            self_test=self
            worker=ReadyWorker(io.StringIO(json.dumps({"protocol_version":1,"command":"item_recorded","job_id":"job","item_id":"key"})+"\n"),out)
            transfer=Transfer(worker,{"job_id":"job","destination":str(root),"source":"youtube"})
            transfer.complete({"item_id":"key","kind":"video"},source)
            self.assertNotEqual(source.read_bytes(),original)
            self.assertIn("item_completed",[json.loads(line)["event"] for line in out.getvalue().splitlines()])
            before=source.read_bytes()
            self.assertEqual(prepare_download_video(source),source)
            self.assertEqual(source.read_bytes(),before)

    def test_h264_mkv_is_remuxed_without_video_encoding(self):
        from social_downloader.playback import prepare_download_video,download_cache
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);ready=root/"ready.mp4";encode_fixture(ready);source=root/"video.mkv"
            encoder=find_tool("ffmpeg");flags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0
            subprocess.run([encoder,"-nostdin","-v","error","-i",str(ready),"-c","copy",str(source)],check=True,capture_output=True,creationflags=flags)
            original=source.read_bytes();real_run=subprocess.run
            with patch("social_downloader.video.subprocess.run",wraps=real_run) as run:
                finalized=prepare_download_video(source)
                conversion=next(call.args[0] for call in run.call_args_list if "-movflags" in call.args[0])
                self.assertEqual(conversion[conversion.index("-c:v")+1],"copy")
            self.assertFalse(source.exists());self.assertEqual(finalized,root/"video.mp4");self.assertTrue(finalized.is_file());self.assertFalse((root/".playback").exists())

    def test_failed_preparation_never_announces_ready_and_preserves_download(self):
        import io,json
        from social_downloader.public_downloads import Transfer
        from social_downloader.worker import Worker
        from social_downloader.models import MediaFailure
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"invalid.mp4";source.write_bytes(b"invalid video");out=io.StringIO()
            transfer=Transfer(Worker(io.StringIO(),out),{"job_id":"job","destination":folder,"source":"youtube"})
            with self.assertRaises(MediaFailure):transfer.complete({"item_id":"key","kind":"video"},source)
            self.assertNotIn("item_completed",[json.loads(line)["event"] for line in out.getvalue().splitlines()]);self.assertEqual(source.read_bytes(),b"invalid video")
