// Run through the guarded fresh-guest or owner-authorized host installer harness.
import { readFile, writeFile } from 'node:fs/promises';
const [endpoint,mode,folder,statePath] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint) || !['seed','verify'].includes(mode)) throw Error('Invalid guest test invocation');
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
let target;
for(let i=0;i<240;i++) {try { const targets=await (await fetch(endpoint+'/json/list')).json();target=targets.find(t=>t.type==='page' && !t.url.startsWith('devtools:'));if(target?.webSocketDebuggerUrl)break;}catch{} await delay(250);}
if(!target?.webSocketDebuggerUrl)throw Error('Installed WebView2 did not expose the guest-only test endpoint.');
const ws = new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
let next=0;const pending=new Map();
ws.addEventListener('message',e=>{const response=JSON.parse(e.data);const item=pending.get(response.id);if(item){pending.delete(response.id);clearTimeout(item.timer);response.error?item.reject(Error(response.error.message)):item.resolve(response.result);}});
function call(method,params){return new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Guest command timed out: '+method));},90000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function invoke(name,args={}){const r=await call('Runtime.evaluate',{expression:`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(name)},${JSON.stringify(args)})`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(name+": "+(r.exceptionDetails.exception?.value || r.exceptionDetails.exception?.description || r.exceptionDetails.text));return r.result.value;}
const assert=(ok,message)=>{if(!ok)throw Error(message);};
// Startup's local capability check briefly owns the shared worker gate.
// Wait only for that specific busy response in this empty-profile test.
async function preflight() {
 for(let i=0;i<120;i++) {
  try { return await invoke('prepare_prototype'); }
  catch(error) { if(!error.message.includes('A test job is already running.'))throw error;await delay(250); }
 }
 throw Error('Local worker gate remained busy for 30 seconds.');
}
try {
    let snapshot;
    for(let i=0;i<60;i++){try{snapshot=await invoke('get_snapshot');break;}catch{await delay(250);}}
    assert(snapshot?.native,'Native catalog did not load.');
    if(mode==='seed') {
        assert(snapshot.total===0 && snapshot.accounts.length===0,'The guest must have an empty catalog and no connected accounts.');
        const settings={...snapshot.settings,downloadFolder:folder,quality:'720',sidebarExpanded:false};
        await invoke('save_settings',{settings});await invoke('save_player_preferences',{preferences:{volume:0.37,muted:true}});
        const draft=await preflight();assert(draft.items===3,'Local worker sample preflight failed.');
        snapshot=await invoke('run_prototype',{token:draft.token,mode:'new_only'});
        assert(snapshot.jobs.some(j=>j.state==='completed'&&j.saved===3),'Installed packaged worker did not complete three local transfers.');
        await invoke('setup_connector',{browser:'edge'});
        await writeFile(statePath,JSON.stringify({total:snapshot.total,settings,player:{volume:0.37,muted:true},jobs:snapshot.jobs.map(j=>j.id)},null,2));
    } else {
        const expected=JSON.parse((await readFile(statePath,'utf8')).replace(/^\uFEFF/,''));
        assert(snapshot.total===expected.total && expected.total>0,'Upgrade did not retain the library.');
        assert(JSON.stringify(snapshot.settings)===JSON.stringify(expected.settings),'Upgrade changed saved settings.');
        if(expected.tools){const tools=await invoke('get_external_tools');assert(tools.galleryPython===expected.tools.galleryPython&&tools.ffmpeg===expected.tools.ffmpeg,'Upgrade lost external-tool selections.');let ready;
          // Startup may briefly own the worker gate. Retry only the documented
          // pending state; blocked/missing capabilities must still fail.
          for(let n=0;n<120;n++){
            ready=await invoke('check_readiness',{browser:'edge'});
            if(ready.checks.find(c=>c.id==='worker')?.state!=='pending')break;
            await delay(250);
          }
          await writeFile(statePath+'.readiness.json',JSON.stringify(ready,null,2));
          for(const id of ['worker','gallery','ffmpeg','youtube']){
            const check=ready.checks.find(c=>c.id===id);
            assert(check?.state==='ready','External tool unavailable after upgrade: '+id+' ('+check?.state+'): '+check?.message);
          }}
        const player=await invoke('get_player_preferences');assert(player.volume===0.37&&player.muted===true,'Upgrade lost player preferences.');
        const auth=await invoke('get_authentication');
        for(const source of ['facebook','tiktok','pinterest'])assert(auth.providers.find(p=>p.source===source)?.privateMedia==='excluded','Installed provider scope is stale: '+source);
        assert(auth.providers.find(p=>p.source==='pinterest')?.identityFlow==='public_links','Installed app still requires Pinterest OAuth setup.');
        assert(auth.google.state==='setup_required','Temporary installed profile unexpectedly acquired Google credentials.');
        assert(expected.jobs.every(id=>snapshot.jobs.some(j=>j.id===id)),'Upgrade lost download history.');
        const library=await invoke('query_library',{query:{search:'',source:null,kind:null,cursor:null}});
        for(const post of library.items){const files=await invoke('post_files',{id:post.id});assert(files.length>0&&files.every(f=>f.available),'Saved sample files are unavailable after upgrade.');}
        const repeat=await preflight();assert(repeat.existing===3&&repeat.missing===0,'Upgrade lost duplicate detection.');
    }
    const screenshot=await call('Page.captureScreenshot',{format:'png'});
    await writeFile(statePath+'.'+mode+'.png',Buffer.from(screenshot.data,'base64'));
    console.log(JSON.stringify({mode,passed:true,total:snapshot.total}));
} finally {ws.close();}
