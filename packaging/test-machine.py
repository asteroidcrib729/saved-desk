"""Sequential, isolated real-desktop acceptance; no VM or owner profile mutation."""
import argparse,hashlib,json,os,shutil,subprocess,time
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TESTS=['native-external-tools','native-smoke','native-live','native-media','native-transitions','native-platforms','native-account-progress','native-discord-media','native-preferences','native-deletion-playback','native-batch-deletion','native-advanced-video','native-video-reliability','native-codec-matrix']
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--tests',nargs='+',choices=TESTS+['chrome-approval','native-authentication','native-watch-later'],default=TESTS);parser.add_argument('--output',default='.cache/machine-native');args=parser.parse_args()
 output=(ROOT/args.output).resolve()
 if not output.is_relative_to(ROOT/'.cache'):raise SystemExit('Evidence must remain in the isolated project cache.')
 output.mkdir(parents=True,exist_ok=True);node=shutil.which('node.exe')
 if not node:raise SystemExit('Node is required to run desktop acceptance.')
 build={'project_version':json.loads((ROOT/'desktop/package.json').read_text())['version'],'files':[]}
 for relative in ['desktop/src-tauri/target/debug/saveddesk.exe','desktop/src-tauri/target/debug/saveddesk-native-host.exe','desktop/src-tauri/target/debug/worker/saveddesk-worker.exe']:
  path=ROOT/relative
  with path.open('rb') as stream:build['files'].append({'path':relative,'sha256':hashlib.file_digest(stream,'sha256').hexdigest()})
 rows=[]
 for name in args.tests:
  start=time.monotonic();timeout=False
  with (output/(name+'.log')).open('wb') as log:
   child=subprocess.Popen([node,str(ROOT/'desktop/scripts'/(name+'.mjs'))],cwd=ROOT/'desktop',stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
   try:code=child.wait(timeout=600)
   except subprocess.TimeoutExpired:
    timeout=True
    if os.name=='nt':subprocess.run(['taskkill.exe','/PID',str(child.pid),'/T','/F'],capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW)
    else:child.kill()
    code=child.wait()
  rows.append({'name':name,'exit_code':code,'timeout':timeout,'seconds':round(time.monotonic()-start,2),'log':str((output/(name+'.log')).relative_to(ROOT))})
  report={'build':build,'passed':all(r['exit_code']==0 and not r['timeout'] for r in rows),'completed':len(rows),'requested':len(args.tests),'created_at_utc':datetime.now(timezone.utc).isoformat(),'tests':rows}
  (output/'results.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
  print(f"{name}: {'PASS' if code==0 and not timeout else 'FAIL'} ({rows[-1]['seconds']} seconds)",flush=True)
  if code:print((output/(name+'.log')).read_text(encoding='utf-8',errors='replace')[-3000:],flush=True)
 return 0 if report['passed'] else 1
if __name__=='__main__':raise SystemExit(main())
