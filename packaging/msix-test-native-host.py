"""Check external native-host launch without accessing account/session data."""
import argparse,json,struct,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('manifest',type=Path);a=p.parse_args()
m=json.loads(a.manifest.read_text(encoding='utf-8-sig'))
if m.get('name')!='com.saveddesk.connector' or m.get('type')!='stdio':raise SystemExit('Unexpected native-host manifest')
origin=m.get('allowed_origins',[None])[0]
if origin!='chrome-extension://chjglnciihblkjnhnpinocknamjoecim/':raise SystemExit('Unexpected test origin')
host=Path(m['path'])
if host.name!='saveddesk-native-host.exe' or not host.is_file():raise SystemExit('Native host missing')
message=json.dumps({'protocol_version':1,'command':'unsupported-fixture'}).encode()
r=subprocess.run([str(host),origin],input=struct.pack('<I',len(message))+message,capture_output=True,timeout=15,creationflags=subprocess.CREATE_NO_WINDOW)
if r.returncode or len(r.stdout)<4:raise SystemExit('Native host framing/launch failed')
length=struct.unpack('<I',r.stdout[:4])[0]
response=json.loads(r.stdout[4:])
if length!=len(r.stdout)-4 or response!={'ok':False,'message':'Unsupported connector request.'}:raise SystemExit('Unexpected credential-free native-host response')
print('External native-host launch and framing passed; no account/session request made.')

version=json.loads((Path(__file__).resolve().parents[1]/"desktop/package.json").read_text())["version"]
message=json.dumps({"protocol_version":1,"command":"connector_probe","browser":"edge","extension_version":version}).encode()
r=subprocess.run([str(host),origin],input=struct.pack("<I",len(message))+message,capture_output=True,timeout=15,creationflags=subprocess.CREATE_NO_WINDOW)
if r.returncode or len(r.stdout)<4:raise SystemExit("External connector handshake did not start")
length=struct.unpack("<I",r.stdout[:4])[0];response=json.loads(r.stdout[4:])
if length!=len(r.stdout)-4 or response.get("ok") is not True or response.get("ready") is not True:raise SystemExit("External connector handshake failed")
print("Protected extension/native-host handshake passed without account or session data.")
