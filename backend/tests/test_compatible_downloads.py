"""Actual format selection/merge and verified storage policy, without platform traffic."""
import copy
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from yt_dlp import YoutubeDL
from social_downloader.models import MediaFailure, VideoSettings, source_format
from social_downloader.tools import find_tool
from social_downloader.video import process_video, hardware_encoding, encode_fixture, SOFTWARE_ENCODING


class CompatibleDownloadsTests(unittest.TestCase):
    def test_reserved_frame_colour_metadata_is_normalized_before_encoding(self):
        encoder=find_tool("ffmpeg");flags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"instagram.mp4"
            subprocess.run([encoder,"-nostdin","-v","error","-f","lavfi","-i","testsrc2=s=160x240:d=1",
                "-f","lavfi","-i","anullsrc=r=44100:cl=stereo","-t","1","-c:v","libvpx-vp9","-deadline","realtime",
                "-cpu-used","8","-threads","1","-c:a","aac",
                "-movflags","+write_colr",str(source)],check=True,capture_output=True,creationflags=flags)
            data=bytearray(source.read_bytes());colour=data.find(b"nclx")
            self.assertGreater(colour,0)
            data[colour+4:colour+10]=bytes([0,0,0,0,0,2])
            source.write_bytes(data)
            original=source.read_bytes()
            before=subprocess.run([encoder,"-hide_banner","-i",str(source)],capture_output=True,creationflags=flags).stderr.decode()
            self.assertIn("reserved",before)
            from social_downloader.video import _run
            with patch("social_downloader.video.hardware_encoding",return_value=None),patch("social_downloader.video._run",wraps=_run) as run:
                self.assertEqual(process_video(source,VideoSettings()),source)
                conversions=[call.args[1] for call in run.call_args_list if "-movflags" in call.args[1]]
                self.assertEqual(len(conversions),1)
                self.assertIn("setparams=",conversions[0][conversions[0].index("-vf")+1])
                checks=[call.args[1] for call in run.call_args_list if "-t" in call.args[1]]
                self.assertEqual(len(checks),1)
                self.assertEqual(checks[0][checks[0].index("-t")+1],"0.25")
            self.assertNotEqual(source.read_bytes(),original)
            after=subprocess.run([encoder,"-hide_banner","-i",str(source)],capture_output=True,creationflags=flags).stderr.decode()
            video=next(line for line in after.splitlines() if "Video:" in line)
            self.assertIn("bt709",video);self.assertNotIn("reserved",video)
            from social_downloader.playback import stream_copy_options
            self.assertEqual(stream_copy_options(after),(True,True))
            self.assertEqual(list(Path(folder).glob(".*.partial.mp4")),[])

    def test_compatible_video_is_unchanged_without_encoding_or_decode_replay(self):
        from social_downloader.video import _run
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"compatible.mp4";encode_fixture(source);original=source.read_bytes()
            with patch("social_downloader.video._run",wraps=_run) as run,patch("social_downloader.video.hardware_encoding") as hardware:
                self.assertEqual(process_video(source,VideoSettings()),source)
                hardware.assert_not_called()
                self.assertEqual(run.call_count,1)
                self.assertNotIn("-movflags",run.call_args.args[1])
                self.assertNotIn("-t",run.call_args.args[1])
            self.assertEqual(source.read_bytes(),original)

    def test_stream_profile_check_accepts_plain_8bit_pixel_format_only(self):
        from social_downloader.playback import stream_copy_options
        good="Video: h264 (High), yuv420p, 1920x1080\nAudio: aac (LC), 48000 Hz, stereo"
        self.assertEqual(stream_copy_options(good),(True,True))
        self.assertFalse(stream_copy_options(good.replace("yuv420p,","yuv420p10le,"))[0])
        self.assertFalse(stream_copy_options(good.replace("yuv420p,","yuv420p(tv, reserved),"))[0])

    def formats(self):
        return [
            {"format_id":"avc360", "height":360,"ext":"mp4","vcodec":"avc1.42001e","acodec":"mp4a.40.2"},
            {"format_id":"aac", "ext":"m4a","vcodec":"none","acodec":"mp4a.40.2","abr":128},
            {"format_id":"opus160", "ext":"webm","vcodec":"none","acodec":"opus","abr":160},
            {"format_id":"avc720", "height":720,"ext":"mp4","vcodec":"avc1.64001f","acodec":"none"},
            {"format_id":"vp9_1080", "height":1080,"ext":"webm","vcodec":"vp9","acodec":"none"},
            {"format_id":"webm1080", "height":1080,"ext":"webm","vcodec":"vp9","acodec":"opus"},
        ]

    def select(self, formats, settings=VideoSettings(), merge=True):
        formats=copy.deepcopy(formats)
        for f in formats:f["url"]="http://127.0.0.1:9/"+f["format_id"]
        with YoutubeDL({"quiet":True,"no_warnings":True,"format":source_format(settings,merge)}) as ydl:
            info=ydl.process_ie_result({"id":"fixture","title":"Synthetic","extractor":"fixture","formats":formats}, download=False)
        return info["format_id"]

    def test_avc_aac_preferred_to_higher_resolution_vp9_opus(self):
        self.assertEqual(self.select(self.formats()),"avc720+aac")
        self.assertEqual(self.select(self.formats(),merge=False),"avc360")

    def test_missing_aac_still_prefers_avc_with_other_audio(self):
        formats=[f for f in self.formats() if f["acodec"] not in {"aac","mp4a.40.2"}]
        self.assertEqual(self.select(formats),"avc720+opus160")

    def test_silent_recordings_keep_video_without_requiring_audio(self):
        self.assertEqual(self.select([self.formats()[3]]),"avc720")
        self.assertEqual(self.select([self.formats()[3]],merge=False),"avc720")

    def test_caps_apply_before_preferences_and_fallbacks(self):
        self.assertEqual(self.select(self.formats(),VideoSettings(480)),"avc360")
        from yt_dlp.utils import ExtractorError
        with self.assertRaises(ExtractorError):self.select([self.formats()[-2]],VideoSettings(360))
        self.assertEqual(self.select([self.formats()[-1]],VideoSettings(480,"compatible_mp4")),"webm1080")

    def test_incompatible_only_inventory_still_has_conversion_fallback(self):
        self.assertEqual(self.select([self.formats()[-1]]),"webm1080")

    def test_real_split_stream_download_merges_without_encoding_or_leftovers(self):
        from social_downloader.public_downloads import Transfer,video_download
        from social_downloader.worker import Worker
        encoder=find_tool("ffmpeg");flags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);fixture=base/"fixture.mp4";encode_fixture(fixture)
            video=base/"avc.mp4";audio=base/"aac.m4a"
            for path,args in [(video,["-an"]),(audio,["-vn"])]:
                subprocess.run([encoder,"-nostdin","-v","error","-i",str(fixture),*args,"-c","copy",str(path)],check=True,capture_output=True,creationflags=flags)
            payloads={"/avc720":video.read_bytes(),"/aac":audio.read_bytes()};requests=[]
            class Handler(BaseHTTPRequestHandler):
                def do_GET(self):
                    requests.append(self.path)
                    data=payloads.get(self.path)
                    self.send_response(200 if data else 404);self.send_header("Content-Length",str(len(data or b"")));self.end_headers();self.wfile.write(data or b"")
                def log_message(self,*args):pass
            server=ThreadingHTTPServer(("127.0.0.1",0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                origin=f"http://127.0.0.1:{server.server_port}"
                formats=self.formats()
                for f in formats:f["url"]=origin+"/"+f["format_id"]
                info={"id":"BaW_jenozKc","title":"Synthetic","extractor":"fixture","formats":formats}
                incoming="".join(json.dumps({"protocol_version":1,"job_id":"job","item_id":"BaW_jenozKc",**c})+"\n" for c in [{"command":"item_decision","transfer":True},{"command":"item_recorded"}])
                output=io.StringIO();root=base/"downloads";root.mkdir()
                transfer=Transfer(Worker(io.StringIO(incoming),output),{"source":"youtube","target":"https://www.youtube.com/watch?v=BaW_jenozKc","job_id":"job","destination":str(root),"test_origin":origin})
                real_run=subprocess.run
                with patch("social_downloader.test_support.public_video_fixture",return_value=info),patch("social_downloader.video.subprocess.run",wraps=real_run) as run:
                    video_download(transfer)
                self.assertEqual(sorted(requests),["/aac","/avc720"])
                self.assertEqual([p.name for p in root.iterdir() if p.is_file()],["BaW_jenozKc.mp4"])
                self.assertFalse((root/".playback").exists())
                self.assertFalse(any("libx264" in c.args[0] for c in run.call_args_list))
                self.assertEqual([json.loads(line)["data"]["original_path"] for line in output.getvalue().splitlines() if json.loads(line)["event"]=="item_completed"],[""])
            finally:server.shutdown();server.server_close();thread.join(2)

    def test_h264_with_opus_keeps_video_packets_and_converts_audio_only(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);fixture=root/"fixture.mp4";encode_fixture(fixture);source=root/"opus.mkv"
            encoder=find_tool("ffmpeg");flags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0
            subprocess.run([encoder,"-nostdin","-v","error","-i",str(fixture),"-c:v","copy","-c:a","libopus",str(source)],check=True,capture_output=True,creationflags=flags)
            real_run=subprocess.run
            with patch("social_downloader.video.subprocess.run",wraps=real_run) as run,patch("social_downloader.video.hardware_encoding") as hardware:
                output=process_video(source,VideoSettings())
                command=next(call.args[0] for call in run.call_args_list if "-movflags" in call.args[0])
                self.assertEqual(command[command.index("-c:v")+1],"copy")
                self.assertEqual(command[command.index("-c:a")+1],"aac");hardware.assert_not_called()
            self.assertFalse(source.exists());self.assertEqual(output,root/"opus.mp4")

    def test_real_vp9_webm_is_replaced_by_one_h264_mp4(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/"youtube.webm";encoder=find_tool("ffmpeg")
            flags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0
            subprocess.run([encoder,"-nostdin","-v","error","-f","lavfi","-i","testsrc2=s=160x240:d=1","-c:v","libvpx-vp9","-threads","1",str(source)],check=True,capture_output=True,creationflags=flags)
            output=process_video(source,VideoSettings())
            self.assertEqual(output,root/"youtube.mp4");self.assertFalse(source.exists())
            self.assertEqual([p.name for p in root.iterdir()],["youtube.mp4"])
            info=subprocess.run([encoder,"-hide_banner","-i",str(output)],capture_output=True,creationflags=flags)
            self.assertIn(b"Video: h264",info.stderr)

    def test_verification_failure_preserves_source_and_cleans_partial(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"video.mp4";encode_fixture(source);original=source.read_bytes()
            from social_downloader.video import _run
            def run(encoder,args,timeout):
                result=_run(encoder,args,timeout)
                if "-t" in args: result.returncode=1
                return result
            with patch("social_downloader.video.hardware_encoding",return_value=None),patch("social_downloader.video._run",side_effect=run):
                with self.assertRaises(MediaFailure):process_video(source,VideoSettings(480,"compatible_mp4"))
            self.assertEqual(source.read_bytes(),original);self.assertEqual(list(Path(folder).glob(".*.partial.mp4")),[])

    def test_collision_never_overwrites_existing_mp4(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);source=base/"video.mkv";existing=base/"video.mp4";encode_fixture(existing);original=existing.read_bytes()
            encoder=find_tool("ffmpeg")
            subprocess.run([encoder,"-nostdin","-v","error","-i",str(existing),"-c","copy",str(source)],check=True,capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0)
            output=process_video(source,VideoSettings())
            self.assertNotEqual(output,existing);self.assertEqual(existing.read_bytes(),original);self.assertFalse(source.exists())

    def test_hardware_presence_without_working_device_uses_software(self):
        hardware_encoding.cache_clear()
        with patch("social_downloader.video._run",return_value=subprocess.CompletedProcess([],1)) as run:
            self.assertIsNone(hardware_encoding("unusable-device"));self.assertIsNone(hardware_encoding("unusable-device"));self.assertEqual(run.call_count,3)
        self.assertEqual(SOFTWARE_ENCODING[SOFTWARE_ENCODING.index("-threads")+1],"2")

    def test_real_input_hardware_failure_falls_back_to_verified_software(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"video.mp4";encode_fixture(source)
            with patch("social_downloader.video.hardware_encoding",return_value=("-c:v","missing_encoder")):
                self.assertEqual(process_video(source,VideoSettings(480,"compatible_mp4")),source)
            self.assertEqual(len(list(Path(folder).glob("*.mp4"))),1)
