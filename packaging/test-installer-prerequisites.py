"""Run the generated WebView section under controlled faults without changing Windows."""
import hashlib,json,os,re,subprocess,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/"desktop/src-tauri/target/release/nsis/x64/installer.nsi"
s=source.read_text(encoding="utf-8");section=s[s.index("Section WebView2"):s.index("Section Install")]
compiler=Path(os.environ["LOCALAPPDATA"])/"tauri/NSIS/makensis.exe"
if not compiler.is_file():raise SystemExit("Use the existing Tauri NSIS compiler for this development test")
output=ROOT/".cache/installer-prerequisites"/str(uuid.uuid4());output.mkdir(parents=True)
scenarios=[("machine-present",True,False,"success",0,0),("user-present",False,True,"success",0,0),("absent-download-install-ok",False,False,"success",0,0),("absent-network-failure",False,False,"offline",0,0),("absent-bootstrap-failure",False,False,"success",1,0),("upgrade-present",True,False,"success",0,1),("upgrade-runtime-absent-upstream-skip",False,False,"success",0,1)]
rows=[]
for name,machine,user,download,install,update in scenarios:
    transcript=output/(name+".txt");binary=output/(name+".exe");script=output/(name+".nsi")
    body=section
    body=re.sub(r'ReadRegStr \$4 (HKLM|HKCU) [^\n]+',lambda m:'StrCpy $4 "'+("154.0.4258.62" if (machine if m[1]=="HKLM" else user) else "")+'"',body)
    body=re.sub(r'NSISdl::download [^\n]+',f'Push "{download}"',body)
    body=re.sub(r'ExecWait "\$6 [^\n]+',f'StrCpy $1 {install}',body)
    body=re.sub(r'DetailPrint "\$\(([^)]+)\)"',lambda m:'FileWrite $9 "'+m[1]+'$\\r$\\n"',body)
    body=re.sub(r'^\s*Delete [^\n]+','',body,flags=re.M)
    body=body.replace('Section WebView2',f'Section WebView2\n FileOpen $9 "{transcript}" w\n StrCpy $UpdateMode {update}').replace('SectionEnd','FileWrite $9 "policy-finished$\\r$\\n"\n FileClose $9\nSectionEnd')
    defines='\n'.join(line for line in s.splitlines() if line.startswith('!define ') and any(line.startswith('!define '+key+' ') for key in ['WEBVIEW2APPGUID','INSTALLWEBVIEW2MODE','WEBVIEW2INSTALLERARGS','WEBVIEW2BOOTSTRAPPERPATH','WEBVIEW2INSTALLERPATH','MINIMUMWEBVIEW2VERSION']))
    langs='\n'.join(f'LangString {key} 1033 "{key}"' for key in sorted(set(re.findall(r'\$\(([^)]+)\)',body))))
    head=f'Unicode true\nName "SavedDesk prerequisite policy QA"\nOutFile "{binary}"\nRequestExecutionLevel user\nSilentInstall silent\nVar UpdateMode\n!include "LogicLib.nsh"\n!include "x64.nsh"\n{defines}\n{langs}\n'
    script.write_text(head+body,encoding="utf-8")
    compiled=subprocess.run([str(compiler),"/V2",str(script)],capture_output=True,timeout=30,creationflags=subprocess.CREATE_NO_WINDOW)
    if compiled.returncode:raise SystemExit(compiled.stdout.decode(errors="replace")+compiled.stderr.decode(errors="replace"))
    result=subprocess.run([str(binary),"/S"],capture_output=True,timeout=30,creationflags=subprocess.CREATE_NO_WINDOW)
    messages=transcript.read_text(encoding="utf-16") if transcript.read_bytes().startswith(b"\xff\xfe") else transcript.read_text(encoding="utf-8-sig")
    expected_failure=not(machine or user or update) and (download!="success" or install!=0)
    if (result.returncode!=0)!=expected_failure:raise SystemExit("Unexpected policy exit for "+name)
    if not(machine or user or update) and "webview2Downloading" not in messages:raise SystemExit("Missing absent-runtime branch")
    if (machine or user or update) and "webview2Downloading" in messages:raise SystemExit("Unexpected prerequisite download")
    rows.append({"name":name,"passed":True,"exit_code":result.returncode,"messages":messages.splitlines(),"simulated":True})
report={"passed":True,"cases":rows,"generated_installer_script_sha256":hashlib.sha256(source.read_bytes()).hexdigest(),"scope":"Generated installer WebView section executed by NSIS on this Windows host; registry reads/download/child exit results replaced with controlled values. No system prerequisites or registry entries changed. Not a real absent-WebView bootstrap installation."}
(output/"acceptance.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print(f"Seven controlled prerequisite policy cases passed: {output}")
