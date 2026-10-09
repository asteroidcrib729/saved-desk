"""Execute SavedDesk's real prerequisite hook with isolated controlled registry/child results."""
import hashlib,json,os,re,subprocess,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'packaging/installer-hooks.nsh';original=source.read_text(encoding='utf-8-sig');functions=original.split('!macro NSIS_HOOK_PREINSTALL')[0]
compiler=Path(os.environ['LOCALAPPDATA'])/'tauri/NSIS/makensis.exe'
output=ROOT/'.cache/installer-runtime-policy'/str(uuid.uuid4());output.mkdir(parents=True)
head='Unicode true\nRequestExecutionLevel user\nSilentInstall silent\n!include "LogicLib.nsh"\n'
def compile(name,code):
 path=output/(name+'.nsi');exe=output/(name+'.exe');path.write_text(head+f'Name "SavedDesk runtime policy QA"\nOutFile "{exe}"\n'+code,encoding='utf8')
 r=subprocess.run([str(compiler),'/V2',str(path)],capture_output=True,timeout=30,creationflags=subprocess.CREATE_NO_WINDOW)
 if r.returncode:raise RuntimeError(r.stdout.decode(errors='replace')+r.stderr.decode(errors='replace'))
 return exe
children={code:compile('child-'+str(code),f'Section\nSetErrorLevel {code}\nSectionEnd\n') for code in [0,1,3010,-2147219416]}
scenarios=[('machine-present','154.0.4258.62','',0,'',False),('user-present','','154.0.4258.62',0,'',False),('zero-machine-valid-user','0.0.0.0','154.0.4258.62',0,'',False),('absent-offline-repair','','',0,'154.0.4258.62',True),('zero-version-repair','0.0.0.0','0.0.0.0',0,'154.0.4258.62',True),('upgrade-absent-repair','','',0,'154.0.4258.62',True),('child-error','','',1,'',True),('successful-exit-no-runtime','','',0,'',True),('restart-exit-registered','','',3010,'154.0.4258.62',True),('restart-exit-not-registered','','',3010,'',True),('already-installed-registered','','',-2147219416,'154.0.4258.62',True),('already-installed-not-registered','','',-2147219416,'',True),('child-cannot-start','','',None,'',True)]
rows=[]
for name,machine,user,exitcode,registered,expected_call in scenarios:
 transcript=output/(name+'.txt');body=functions
 def registry(m):
  before=machine if m[1]=='HKLM' else user
  after=registered if m[1]=='HKCU' else ''
  return f'${{If}} $RuntimeAttempted == 1\n StrCpy $4 "{after}"\n${{Else}}\n StrCpy $4 "{before}"\n${{EndIf}}'
 body=re.sub(r'ReadRegStr \$4 (HKLM|HKCU) [^\n]+',registry,body)
 # File extraction and real ExecWait remain; only the payload is a harmless child.
 body=re.sub(r'File "/oname=\$PLUGINSDIR[^\n]+',lambda m:f'File "/oname=$PLUGINSDIR\\SavedDeskWebView2.exe" "{children[exitcode if exitcode is not None else 0]}"',body)
 body=body.replace('ExecWait \'"$PLUGINSDIR\\SavedDeskWebView2.exe" /silent /install\' $1',('ExecWait \'"$PLUGINSDIR\\does-not-exist.exe" /silent /install\' $1' if exitcode is None else 'ExecWait \'"$PLUGINSDIR\\SavedDeskWebView2.exe" /silent /install\' $1')+'\n StrCpy $RuntimeAttempted 1\n FileOpen $9 "'+str(transcript)+'" w\n FileWrite $9 "child-invoked$\\r$\\n"\n FileClose $9')
 exe=compile(name,'Var RuntimeAttempted\n'+body+'\nSection\nStrCpy $RuntimeAttempted 0\nCall SavedDeskEnsureWebView\nFileOpen $9 "'+str(transcript)+'" a\nFileSeek $9 0 END\nFileWrite $9 "policy-finished$\\r$\\n"\nFileClose $9\nSectionEnd\n')
 r=subprocess.run([str(exe),'/S'],capture_output=True,timeout=30,creationflags=subprocess.CREATE_NO_WINDOW)
 data=transcript.read_bytes() if transcript.exists() else b'';messages=data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')
 failure=expected_call and (exitcode not in [0,3010,-2147219416] or not registered)
 assert r.returncode==(2 if failure else 0),(name,r.returncode)
 assert ('child-invoked' in messages)==expected_call,(name,messages)
 assert ('policy-finished' in messages)==(not failure),(name,messages)
 rows.append({'name':name,'passed':True,'exit_code':r.returncode,'child_invoked':expected_call,'simulated_registry':True,'simulated_payload':True})
report={'passed':True,'cases':rows,'hook_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'scope':'Actual production hook executed by NSIS with controlled registry reads and harmless child payloads. No system runtime or registry changes; real missing-runtime install still requires an unprepared Windows environment.'}
(output/'acceptance.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print('Thirteen offline/upgrade/failure runtime policy cases passed:',output)
