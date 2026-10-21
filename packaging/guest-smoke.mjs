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
function call(method,params,timeout=90000){return new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Guest command timed out: '+method));},timeout);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function invoke(name,args={}){const r=await call('Runtime.evaluate',{expression:`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(name)},${JSON.stringify(args)})`,awaitPromise:true,returnByValue:true},name==="install_gallery_tools"?900000:90000);if(r.exceptionDetails)throw Error(name+": "+(r.exceptionDetails.exception?.value || r.exceptionDetails.exception?.description || r.exceptionDetails.text));return r.result.value;}
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
async function toolsStatus(){
 for(let n=0;n<120;n++){
  try{return await invoke('get_download_tools_status');}
  catch(error){if(!/Finish the current download or preview before checking tools/i.test(error.message))throw error;await delay(250);}
 }
 throw Error('Startup tool check remained busy for 30 seconds.');
}
try {
    let snapshot;
    for(let i=0;i<60;i++){try{snapshot=await invoke('get_snapshot');break;}catch{await delay(250);}}
    assert(snapshot?.native,'Native catalog did not load.');
    if(mode==='seed') {
        assert(snapshot.total===0 && snapshot.accounts.length===0,'The guest must have an empty catalog and no connected accounts.');
        let tools;
        for(let n=0;n<40;n++){try{tools=await invoke('get_download_tools_status');break;}catch(e){if(!/current download|before checking|busy|preview/i.test(e.message))throw e;await delay(250);}}
        assert(tools?.ffmpegReady&&tools?.ffprobeReady,'A fresh installation cannot start its included video tools.');
        assert(tools.galleryReady===false,'Fresh installation unexpectedly inherited gallery tools.');
        assert(tools.ffmpeg.toLowerCase().includes('windowsapps'),'Media check used a developer FFmpeg installation.');
        await writeFile(statePath+'.fresh-tools.json',JSON.stringify(tools,null,2));
        let consentRefused=false;try{await invoke('install_gallery_tools',{consent:false});}catch{consentRefused=true;}
        assert(consentRefused,'Gallery installation did not require explicit consent.');
        let privateSetupBlocked=false;try{await invoke('begin_connection',{source:'instagram',browser:'edge'});}catch(e){privateSetupBlocked=/Gallery downloads need setup/.test(e.message);}
        assert(privateSetupBlocked,'Missing gallery setup was allowed to enter browser approval.');
        const settings={...snapshot.settings,downloadFolder:folder,quality:'720',sidebarExpanded:false};
        await invoke('save_settings',{settings});await invoke('save_player_preferences',{preferences:{volume:0.37,muted:true}});
        const draft=await preflight();assert(draft.items===3,'Local worker sample preflight failed.');
        snapshot=await invoke('run_prototype',{token:draft.token,mode:'new_only'});
        assert(snapshot.jobs.some(j=>j.state==='completed'&&j.saved===3),'Installed packaged worker did not complete three local transfers.');
        // The owner-supplied public link must work before any account or gallery setup.
        const live={platform:'youtube',authenticated:false,startedAt:new Date().toISOString(),passed:false};
        try{
          const draft=await invoke('prepare_download',{request:{source:'youtube',target:'https://www.youtube.com/shorts/Y8_t4EXP1XM',title:'Store public video acceptance',quality:'720',profile:'original'}});
          const id=await invoke('start_download',{token:draft.token,mode:'new_only'});
          const end=Date.now()+300000;
          let job;
          while(Date.now()<end){snapshot=await invoke('get_snapshot');job=snapshot.jobs.find(j=>j.id===id);if(job&&['completed','failed','cancelled','interrupted'].includes(job.state))break;await delay(500);}
          if(!job||!['completed','failed','cancelled','interrupted'].includes(job.state)){await invoke('stop_download',{id,pause:false});throw Error('Public video exceeded five minutes.');}
          live.state=job.state;live.saved=job.saved;live.failed=job.failed;live.error=job.error;
          assert(job.state==='completed'&&job.saved>0&&job.failed===0,'Public YouTube download failed: '+(job.error||job.state));
          const library=await invoke('query_library',{query:{search:'',source:'youtube',kind:null,cursor:null}});
          assert(library.items.length>0,'Public video was not added to the library.');
          for(const post of library.items){const files=await invoke('post_files',{id:post.id});assert(files.length>0&&files.every(f=>f.available&&f.name.toLowerCase().endsWith('.mp4')),'Public video is not a playable stored MP4.');}
          const post=library.items[0],file=(await invoke('post_files',{id:post.id})).find(f=>f.kind==='video');
          assert(file,'Downloaded public video has no playback entry.');
          const created=await call('Runtime.evaluate',{expression:`(()=>{const root=document.createElement('div');root.id='store-playback-test';root.style.cssText='position:fixed;left:20px;top:20px;z-index:2147483647;padding:12px;background:#172126';const v=document.createElement('video');v.id='store-playback-video';v.muted=true;v.style.cssText='display:block;width:320px;height:180px';const b=document.createElement('button');b.textContent='Play acceptance video';b.onclick=()=>{v.play().catch(error=>{window.__storePlaybackError=String(error);});};root.append(v,b);document.body.append(root);v.src='http://savedmedia.localhost/${file.id}';const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,returnByValue:true});
          assert(!created.exceptionDetails,'Playback test control could not be created.');
          const point=created.result.value;
          await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
          await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
          let played;
          for(let n=0;n<80;n++){
            const state=await call('Runtime.evaluate',{expression:"(()=>{const v=document.getElementById('store-playback-video');return {ok:v.currentTime>0&&v.videoWidth>0,time:v.currentTime,width:v.videoWidth,height:v.videoHeight,ready:v.readyState,error:window.__storePlaybackError||v.error?.message};})()",returnByValue:true});
            played=state.result?.value;
            if(played?.ok||played?.error)break;
            await delay(250);
          }
          await writeFile(statePath+'.playback-debug.json',JSON.stringify(played??{},null,2));
          assert(played?.ok,'Installed WebView failed user-click video playback: '+JSON.stringify(played));
          live.playback=played;
          await call('Runtime.evaluate',{expression:"document.getElementById('store-playback-video').pause();document.getElementById('store-playback-test').remove();"});
          live.passed=true;
        }catch(error){live.error=String(error);throw error;}
        finally{await writeFile(statePath+'.public-video.json',JSON.stringify(live,null,2));}
        snapshot=await invoke('get_snapshot');
        const installed=await invoke('install_gallery_tools',{consent:true});
        const checked=await toolsStatus();
        assert(checked.galleryReady&&checked.ffmpegReady&&checked.ffprobeReady,'Packaged gallery setup did not pass its real startup checks.');
        await writeFile(statePath+'.gallery-setup.json',JSON.stringify({passed:true,galleryPython:installed.galleryPython,mediaAutomatic:true},null,2));
        await invoke('setup_connector',{browser:'edge',consent:true});
        await writeFile(statePath,JSON.stringify({total:snapshot.total,settings,player:{volume:0.37,muted:true},jobs:snapshot.jobs.map(j=>j.id),galleryPython:installed.galleryPython,mediaAutomatic:true},null,2));
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
        if(expected.mediaAutomatic){
          const tools=await toolsStatus();
          assert(tools.ffmpegReady&&tools.ffprobeReady&&tools.galleryReady,'Upgrade lost included media tools or the separate gallery installation.');
          assert(tools.galleryPython===expected.galleryPython,'Upgrade changed the separate gallery interpreter path.');
          assert(tools.ffmpeg.toLowerCase().includes('windowsapps'),'Upgrade persisted an old automatic video tool path.');
          const connector=await invoke('get_browser_connector_status',{browser:'edge'});
          assert(connector.registered&&connector.verified,'The external native-host handshake was not retained through the unchanged-binary upgrade fixture.');
          await invoke('begin_connection',{source:'youtube',browser:'edge'});
          const pending=await invoke('get_snapshot');
          assert(pending.accounts.some(a=>a.source==='youtube'&&a.state==='awaiting_permission'),'A verified connector could not start browser approval.');
          await invoke('cancel_connection');
          let cancelled;
          for(let n=0;n<120;n++){cancelled=await invoke('get_snapshot');if(!cancelled.accounts.some(a=>a.state==='awaiting_permission'||a.state==='connecting'))break;await delay(100);}
          assert(!cancelled.accounts.some(a=>a.state==='awaiting_permission'||a.state==='connecting'),'Browser approval cancellation did not clear pending state within 12 seconds.');
          await writeFile(statePath+'.connector-lifecycle.json',JSON.stringify({passed:true,externalNativeHandshake:true,approvalStarted:true,cancellation:true,accountSessionRead:false},null,2));

        }
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
