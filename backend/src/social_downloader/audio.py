"""Bounded decode verification for selected audio attachments."""
import subprocess
import sys
from .models import MediaFailure
from .tools import find_tool

def verify_audio(path):
    encoder=find_tool("ffmpeg")
    if not encoder:raise MediaFailure("Audio verification needs FFmpeg. Repair the app installation.")
    flags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0
    try:
        result=subprocess.run([encoder,"-nostdin","-v","error","-threads","1","-protocol_whitelist","file,pipe","-i",str(path),"-map","0:a:0","-t","0.1","-f","null","-"],capture_output=True,timeout=20,creationflags=flags)
    except (OSError,subprocess.TimeoutExpired):
        raise MediaFailure("This audio attachment could not be verified. Nothing was added to the library.") from None
    if result.returncode!=0:raise MediaFailure("This attachment is not playable audio. Nothing was added to the library.")
