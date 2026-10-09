"""Bounded advanced options and real FFmpeg output, with no platform traffic."""
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from social_downloader.models import VideoSettings
from social_downloader.tools import find_tool
from social_downloader.video import process_video, encode_fixture, _run

class AdvancedVideoTests(unittest.TestCase):
    def test_legacy_commands_keep_defaults_and_invalid_values_rejected(self):
        self.assertEqual(VideoSettings.from_command({}),VideoSettings())
        for advanced in [None,[],{"args":"-injected"},{"encoder":"nvenc"},{"preset":"unsafe"},{"crf":True},{"crf":0},{"audioBitrate":True},{"audioBitrate":320}]:
            with self.subTest(advanced=advanced),self.assertRaises(ValueError):VideoSettings.from_command({"advanced":advanced})

    def test_invalid_advanced_choices_do_not_create_destination_or_contact_platform(self):
        from social_downloader.live import execute
        with tempfile.TemporaryDirectory() as folder:
            for source,target in [("instagram","https://www.instagram.com/p/example/"),("youtube","https://www.youtube.com/watch?v=BaW_jenozKc")]:
                destination=Path(folder)/source
                command={"source":source,"target":target,"job_id":"invalid","destination":str(destination),"advanced":{"crf":True}}
                with patch("social_downloader.public_downloads.video_download") as download,patch("social_downloader.authentication.verify_account") as verify:
                    with self.assertRaises(ValueError):execute(None,command)
                    download.assert_not_called();verify.assert_not_called()
                self.assertFalse(destination.exists())

    def test_software_quality_and_audio_bitrate_affect_real_output(self):
        encoder=find_tool("ffmpeg");flags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/"source.webm"
            subprocess.run([encoder,"-nostdin","-v","error","-f","lavfi","-i","testsrc2=s=320x240:r=24:d=2",
                "-f","lavfi","-i","sine=frequency=440:duration=2","-c:v","libvpx-vp9","-deadline","realtime","-cpu-used","8",
                "-threads","1","-c:a","libopus","-t","2",str(source)],check=True,capture_output=True,creationflags=flags)
            sizes=[];bitrates=[]
            for name,crf,bitrate,preset in [("high",18,256,"slow"),("compact",28,96,"superfast")]:
                copy=root/(name+".webm");shutil.copyfile(source,copy)
                settings=VideoSettings.from_command({"advanced":{"encoder":"software","preset":preset,"crf":crf,"audioBitrate":bitrate}})
                with patch("social_downloader.video.hardware_encoding") as hardware,patch("social_downloader.video._run",wraps=_run) as run:
                    output=process_video(copy,settings);hardware.assert_not_called()
                    conversion=next(call.args[1] for call in run.call_args_list if "-movflags" in call.args[1])
                    self.assertEqual(conversion[conversion.index("-preset")+1],preset)
                    self.assertEqual(conversion[conversion.index("-crf")+1],str(crf))
                    self.assertEqual(conversion[conversion.index("-b:a")+1],f"{bitrate}k")
                self.assertFalse(copy.exists());self.assertEqual(output.suffix,".mp4");sizes.append(output.stat().st_size)
                decoded=subprocess.run([encoder,"-nostdin","-v","error","-xerror","-i",str(output),"-f","null","-"],capture_output=True,creationflags=flags)
                self.assertEqual(decoded.returncode,0)
                info=subprocess.run([encoder,"-hide_banner","-i",str(output)],capture_output=True,creationflags=flags).stderr.decode()
                self.assertIn("Video: h264",info);self.assertIn("Audio: aac (LC)",info)
            self.assertGreater(sizes[0],sizes[1]);self.assertFalse(list(root.glob(".*.partial.mp4")))

    def test_advanced_options_never_reencode_compatible_video(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"playable.mp4";encode_fixture(source);original=source.read_bytes()
            with patch("social_downloader.video.hardware_encoding") as hardware,patch("social_downloader.video._run",wraps=_run) as run:
                self.assertEqual(process_video(source,VideoSettings(encoder="software",preset="slow",crf=18,audio_bitrate=256)),source)
                hardware.assert_not_called();self.assertEqual(run.call_count,1)
            self.assertEqual(source.read_bytes(),original)
