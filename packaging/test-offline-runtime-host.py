"""Exercise the real offline payload on this equipped host with initial missing detection injected."""
import hashlib,json,os,subprocess,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
review=json.loads((ROOT/'licensing/WEBVIEW2-REVIEW.json').read_text(encoding='utf-8-sig'));payload=ROOT/review['path']
assert hashlib.file_digest(payload.open('rb'),'sha256').hexdigest()==review['sha256']
source=ROOT/'packaging/installer-hooks.nsh';body=source.read_text(encoding='utf-8-sig').split('!macro NSIS_HOOK_PREINSTALL')[0]
output=ROOT/'.cache/offline-runtime-host'/str(uuid.uuid4());output.mkdir(parents=True);exe=output/'offline-repair-qa.exe';log=output/'transcript.txt'
body=body.replace('Function SavedDeskReadWebView\n','Function SavedDeskReadWebView\n  ${If} $ForceInitialMissing == 1\n    StrCpy $4 ""\n    Return\n  ${EndIf}\n',1)
body=body.replace('${__FILEDIR__}\\..\\.cache\\webview-runtime\\MicrosoftEdgeWebView2RuntimeInstallerX64.exe',str(payload))
line='ExecWait \'"$PLUGINSDIR\\SavedDeskWebView2.exe" /silent /install\' $1'
assert line in body
body=body.replace(line,line+'\n StrCpy $ForceInitialMissing 0\n FileOpen $9 "'+str(log)+'" w\n FileWrite $9 "child-exit=$1$\\r$\\n"\n FileClose $9')
code='Unicode true\nRequestExecutionLevel user\nSilentInstall silent\nSetCompressor /SOLID lzma\n!include "LogicLib.nsh"\nVar ForceInitialMissing\nName "SavedDesk real offline prerequisite QA"\nOutFile "'+str(exe)+'"\n'+body+'\nSection\nStrCpy $ForceInitialMissing 1\nCall SavedDeskEnsureWebView\nFileOpen $9 "'+str(log)+'" a\nFileSeek $9 0 END\nFileWrite $9 "post-install-runtime=$4$\\r$\\npolicy-finished$\\r$\\n"\nFileClose $9\nSectionEnd\n'
script=output/'offline-repair-qa.nsi';script.write_text(code,encoding='utf8');compiler=Path(os.environ['LOCALAPPDATA'])/'tauri/NSIS/makensis.exe'
r=subprocess.run([str(compiler),'/V2',str(script)],capture_output=True,timeout=240,creationflags=subprocess.CREATE_NO_WINDOW)
if r.returncode:raise RuntimeError(r.stdout.decode(errors='replace')+r.stderr.decode(errors='replace'))
r=subprocess.run([str(exe),'/S'],capture_output=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW)
b=log.read_bytes();messages=b.decode('utf-16' if b.startswith(b'\xff\xfe') else 'utf-8-sig').splitlines()
report={'passed':r.returncode==0 and 'policy-finished' in messages,'exit_code':r.returncode,'messages':messages,'hook_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'runtime_installer_sha256':review['sha256'],'scope':'Initial runtime detection forced missing in this QA-only wrapper; real unmodified signed Microsoft offline payload extracted/executed and post-install registry detection unmodified. Existing machine runtime was not removed. Not proof of a genuinely unprepared machine.'}
(output/'acceptance.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report,indent=2));print('Evidence:',output)
raise SystemExit(0 if report['passed'] else 1)
