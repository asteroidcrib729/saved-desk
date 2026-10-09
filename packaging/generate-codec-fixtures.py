"""Small real codec inputs for the packaged-worker/WebView acceptance matrix."""
import argparse,json,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"backend/src"))
from social_downloader.tools import find_tool
from social_downloader.video import hardware_encoding
p=argparse.ArgumentParser();p.add_argument("directory",type=Path);a=p.parse_args();directory=a.directory.resolve()
if not directory.is_relative_to(ROOT/".cache"):raise SystemExit("Private cache fixtures only")
directory.mkdir(parents=True,exist_ok=True);encoder=find_tool("ffmpeg");flags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0
cases=[
 ("h264-aac","mp4",["-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p"],["-c:a","aac"]),
 ("h264-silent","mp4",["-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p"],[]),
 ("h264-opus","mkv",["-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p"],["-c:a","libopus"]),
 ("vp9-opus","webm",["-c:v","libvpx-vp9","-deadline","realtime","-cpu-used","8"],["-c:a","libopus"]),
 ("av1-opus","mkv",["-c:v","libaom-av1","-cpu-used","8","-row-mt","1"],["-c:a","libopus"]),
 ("hevc-aac","mp4",["-c:v","libx265","-preset","ultrafast","-x265-params","pools=none:frame-threads=1:log-level=error"],["-c:a","aac"]),
 ("h264-10bit","mp4",["-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p10le"],["-c:a","aac"]),
 ("h264-444","mp4",["-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv444p"],["-c:a","aac"]),
 ("mjpeg-pcm","avi",["-c:v","mjpeg","-pix_fmt","yuvj420p"],["-c:a","pcm_s16le"]),
 ("h264-mov","mov",["-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p"],["-c:a","aac"]),
 ("h264-m4v","m4v",["-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p"],["-c:a","aac","-f","mp4"]),
]
rows=[]
for name,ext,video,audio in cases:
 path=directory/(name+"."+ext);args=[encoder,"-nostdin","-v","error","-n","-f","lavfi","-i","testsrc2=s=160x240:r=15:d=0.8"]
 if audio:args += ["-f","lavfi","-i","sine=frequency=440:sample_rate=48000"]
 args += ["-t","0.8",*video,"-threads","1","-filter_threads","1",*audio,str(path)]
 result=subprocess.run(args,capture_output=True,timeout=45,creationflags=flags)
 if result.returncode:raise SystemExit(f"Fixture {name} failed: "+result.stderr.decode(errors="replace")[-1000:])
 rows.append({"name":name,"extension":ext,"file":str(path),"bytes":path.stat().st_size})
t=time.monotonic();hardware_encoding.cache_clear();acceleration=hardware_encoding(encoder)
(directory/"fixtures.json").write_text(json.dumps({"cases":rows,"hardware_encoding":list(acceleration) if acceleration else None,"hardware_probe_seconds":round(time.monotonic()-t,3)},indent=2)+"\n",encoding="utf-8")
print(f"Generated {len(rows)} codec fixtures; acceleration: {acceleration}")
