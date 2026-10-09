// Real installed release, user-supplied links, DPAPI inputs, isolated catalog.
import {chromium,expect} from '@playwright/test';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
const [endpoint,folder,reportPath,ownerBackup,inputPath,installerHash]=process.argv.slice(2);
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint)||!/^[a-f0-9]{64}$/.test(installerHash))throw Error('Invalid live test invocation');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const privateMode=process.env.SAVEDDESK_QA_PRIVATE==='1';
const transferTimeout=privateMode?30*60*1000:240000;
const ordinary=p=>p.startsWith('\\\\?\\')?p.slice(4):p;
const check=(ok,message)=>{if(!ok)throw Error(message);};
const until=async(fn,timeout=30000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await delay(250);}throw Error('Timed out waiting for test condition');};
const decrypt=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.Security; $p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($p),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))"],{input:Buffer.from(inputPath).toString('base64'),windowsHide:true,encoding:'utf8'});
check(decrypt.status===0,'Protected test inputs could not be opened');
const targets=JSON.parse(decrypt.stdout);decrypt.stdout='';
const report={schema:1,installer_sha256:installerHash,passed:false,live:true,results:[],started_at_utc:new Date().toISOString(),scope:privateMode?'Installed release, owner-authorized private collections, 30-minute per-job ceiling, isolated folder/protected sessions. This report does not certify other private providers.':'Installed release, real provider requests, separate selected folder, existing protected sessions only. URLs and credentials omitted.',content_scope:privateMode?'private-collections':'supplied-public-links'};
let browser,db;
const persist=()=>writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
try{
 await until(async()=>{try{return (await fetch(endpoint+'/json/version')).ok;}catch{return false;}},60000);
 browser=await chromium.connectOverCDP(endpoint);report.browser=browser.version();
 const page=browser.contexts()[0].pages()[0];const pageErrors=[];page.on('pageerror',()=>pageErrors.push('Renderer error'));
 const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
 await page.getByRole('heading',{name:'Library',exact:true}).waitFor({timeout:45000});
 let snapshot=await invoke('get_snapshot');check(snapshot.native&&snapshot.total===0&&snapshot.accounts.length===0,'Temporary profile is not empty');
 const profile=resolve(process.env.LOCALAPPDATA,'com.saveddesk.desktop');
 db=new DatabaseSync(resolve(profile,'prototype-catalog.db'));db.exec('PRAGMA busy_timeout=3000');
 // Copy scoped account bindings only, without inspecting or exporting session plaintext.
 try{const original=new DatabaseSync(resolve(ownerBackup,'prototype-catalog.db'),{readOnly:true});const rows=original.prepare("SELECT * FROM accounts WHERE source IN ('youtube','facebook','instagram','tiktok','pinterest','x') AND state IN ('connected','session_ready')").all();
 const insert=db.prepare('INSERT INTO accounts(source,account_id,username,browser,state,message,verified_at) VALUES(?,?,?,?,?,?,?)');
 for(const r of rows){try{await stat(resolve(profile,`session-${r.source}.dpapi`));insert.run(r.source,r.account_id,r.username,r.browser,r.state,'',r.verified_at??null);}catch{}}
 original.close();}catch{}
 snapshot=await invoke('get_snapshot');await invoke('save_settings',{settings:{...snapshot.settings,downloadFolder:folder,quality:'original',profile:'original'}});
 await page.reload();await page.getByRole('heading',{name:'Library',exact:true}).waitFor();
 await page.evaluate(async()=>{window.__liveProgress={};const handler=window.__TAURI_INTERNALS__.transformCallback(event=>{const p=event.payload;if(p.event==='download_progress'){const s=window.__liveProgress[p.job_id]??={count:0,maxReceived:0,maxTotal:0,phases:[]};s.count++;s.maxReceived=Math.max(s.maxReceived,p.data.received??0);s.maxTotal=Math.max(s.maxTotal,p.data.total??0);if(!s.phases.includes(p.data.phase))s.phases.push(p.data.phase);}});await window.__TAURI_INTERNALS__.invoke('plugin:event|listen',{event:'worker-event',target:{kind:'Any'},handler});});
 const state=id=>db.prepare('SELECT * FROM download_jobs WHERE id=?').get(id);
 async function finished(id,result){const end=Date.now()+transferTimeout;let nextLog=Date.now()+30000;while(Date.now()<end){const job=state(id);if(['completed','failed','interrupted','cancelled'].includes(job.state))return job;result.progress_visible ||= await page.locator('.download-progress progress').count()>0;if(Date.now()>nextLog){console.log(JSON.stringify({platform:job.source,state:job.state,saved:job.saved,skipped:job.skipped,failed:job.failed}));nextLog=Date.now()+30000;}await delay(400);}await invoke('stop_download',{id,pause:false});throw Error('Download exceeded the bounded test duration; stopped');}
 async function queue(source,target){const draft=await invoke('prepare_download',{request:{source,target,title:`Live acceptance ${source}`,quality:'original',profile:'original'}});return {draft,id:await invoke('start_download',{token:draft.token,mode:'new_only'})};}
 for(const source of ['youtube','facebook','discord','instagram','pinterest','tiktok','x']){
  if(!Object.hasOwn(targets,source))continue;
  const result={platform:source,live:true,passed:false,checks:[],tested_at_utc:new Date().toISOString(),progress_visible:false};report.results.push(result);await persist();console.log(`Starting live test: ${source}`);
  let id;
  try{
   await page.getByRole('button',{name:'Add download',exact:true}).click();const dialog=page.locator('dialog[open]').filter({has:page.getByRole('heading',{name:'Add download',exact:true})});
   await dialog.getByRole('combobox',{name:'Platform',exact:true}).selectOption(source);
   if(!await dialog.getByRole('button',{name:'Start download',exact:true}).count()){result.status='account_approval_required';throw Error('An approved account is required in the temporary test profile');}
   await dialog.getByRole('textbox',{name:source==='discord'?'Media attachment link':'Post or collection link',exact:true}).fill(targets[source]);
   await dialog.getByRole('textbox',{name:source==='discord'?'Download name':'Collection name',exact:true}).fill(`Live acceptance ${source}`);
   await dialog.getByRole('button',{name:'Start download',exact:true}).click();
   await until(async()=>{const job=db.prepare('SELECT id FROM download_jobs WHERE source=? ORDER BY created_at DESC LIMIT 1').get(source);if(job)return id=job.id;const alert=dialog.locator('[role=alert]');if(await alert.count())throw Error(await alert.innerText());return false;});
   result.checks.push('download-created-through-app-form');await page.getByRole('button',{name:'Downloads',exact:true}).click();
   // Exercise the actual pause/resume mechanism once, avoiding repeated failed-provider requests.
   if((source==='youtube'||(privateMode&&source==='instagram'))&&['queued','running'].includes(state(id).state)){
    const running=page.locator('.job-card').filter({has:page.getByRole('heading',{name:state(id).title,exact:true})});
    const pause=running.getByRole('button',{name:'Pause',exact:true});
    if(await pause.count()){
     result.control_phase='pause';await pause.click();await until(()=>state(id).state==='paused',10000);
     // One click acknowledges shutdown and safely queues the next generation.
     result.control_phase='resume';
     const resume=running.getByRole('button',{name:'Resume',exact:true});
     await expect(resume).toBeEnabled({timeout:10000});await resume.click();
     await until(()=>['queued','running','completed'].includes(state(id).state),35000);
     result.resume_clicks=1;
     result.control_phase='finished';result.checks.push('live-ui-pause-and-resume');
    }
   }
   const job=await finished(id,result);result.state=job.state;result.saved=job.saved;result.failed=job.failed;
   result.progress=await page.evaluate(id=>window.__liveProgress[id]??{count:0},id);
   if(job.state!=='completed'){result.error=job.error||'The live download did not complete';throw Error(result.error);}
   check(job.saved>0,'No files were saved');result.checks.push('live-download-completed');
   const files=db.prepare('SELECT * FROM media_files WHERE job_id=?').all(id);check(files.length===job.saved,'Catalog/file counts differ');
   for(const file of files){check(resolve(ordinary(file.path)).toLowerCase().startsWith(resolve(folder).toLowerCase()+sep),'File escaped selected folder');check((await stat(file.path)).size===file.bytes&&file.bytes>0,'Media bytes differ');check(!file.original_path,'An incompatible original was retained');}
   result.bytes=files.reduce((n,f)=>n+f.bytes,0);result.posts=db.prepare('SELECT count(DISTINCT post_id) n FROM media_files WHERE job_id=?').get(id).n;result.checks.push('selected-folder-confinement-and-catalog-files');
   await page.getByRole('button',{name:'Library',exact:true}).click();await page.getByRole('combobox',{name:'Library platform',exact:true}).selectOption(source);
   await page.getByRole('button',{name:'View saved files',exact:true}).first().click();
   const media=page.locator('dialog[open] .media-stage video');const image=page.locator('dialog[open] .media-stage img');
   await until(async()=>await media.count()||await image.count(),45000);
   if(await media.count()){
    await until(()=>media.evaluate(v=>!v.error&&v.readyState>=2&&v.videoWidth>0),20000);
    await page.getByRole('button',{name:'Play video',exact:true}).click();await until(()=>media.evaluate(v=>!v.paused&&v.currentTime>0),10000);
    await page.getByRole('button',{name:'Pause video',exact:true}).click();check(await media.evaluate(v=>v.paused),'Pause failed');
    const repeatButton=page.getByRole('button',{name:'Repeat video',exact:true});if(await repeatButton.getAttribute('aria-pressed')!=='true')await repeatButton.click();check(await media.evaluate(v=>v.loop),'Repeat flag failed');
    await media.evaluate(v=>{v.currentTime=Math.min(v.duration/2,5);});await until(()=>media.evaluate(v=>!v.seeking),10000);
    await page.getByRole('slider',{name:'Video volume',exact:true}).evaluate(el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'37');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});await delay(350);check((await invoke('get_player_preferences')).volume===0.37,'Volume was not persisted');
    result.video=await media.evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration,currentTime:v.currentTime}));
    result.checks.push('webview-video-decode-play-pause-seek-repeat-and-persistent-volume');
   }else{await until(()=>image.evaluate(v=>v.complete&&v.naturalWidth>0),15000);result.checks.push('webview-image-decode');}
   await page.getByRole('button',{name:'Close',exact:true}).click();
   const duplicate=await queue(source,targets[source]);check(duplicate.draft.existing>0,'Duplicate was not recognized');
   await page.getByRole('button',{name:'Downloads',exact:true}).click();const skipped=await finished(duplicate.id,result);check(skipped.state==='completed'&&skipped.saved===0&&skipped.skipped===files.length,'Duplicate transferred again or failed');result.checks.push('duplicate-new-only-skips-existing-media');
   // Delete only this disposable test download, using the app confirmation UI.
   const card=page.locator('.job-card').filter({has:page.getByRole('heading',{name:job.title,exact:true})}).filter({has:page.getByText(`${job.saved} saved`,{exact:false})});
   await card.getByRole('button',{name:'Delete download',exact:true}).click();await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
   await until(()=>!state(id));for(const f of files){let exists=true;try{await stat(f.path);}catch{exists=false;}check(!exists,'Deleted test media remains on storage');}result.checks.push('confirmed-ui-deletion-removes-test-files');
   // Remove the empty duplicate history row via the same reviewed deletion mechanism.
   const decision=await invoke('prepare_deletion',{target:{kind:'download',id:duplicate.id}});await invoke('delete_saved_content',{token:decision.token});
   check(pageErrors.length===0,'Renderer exceptions occurred');result.passed=true;result.status='passed';
  }catch(error){result.error=String(error?.message??error).split('?')[0].slice(0,700);result.status??='failed';try{result.control_feedback=await page.locator('div[role="status"][aria-atomic="true"]').allTextContents();result.cleanup_ui=await page.locator('.job-card').evaluateAll(cards=>cards.map(c=>({title:c.querySelector('h3')?.textContent,counts:c.querySelector('.job-copy > p')?.textContent,buttons:Array.from(c.querySelectorAll('button')).map(b=>({text:b.textContent,disabled:b.disabled}))})));}catch{}try{if(id&&['queued','running','paused'].includes(state(id)?.state))await invoke('stop_download',{id,pause:false});}catch{}try{const close=page.locator('dialog[open]').getByRole('button',{name:'Cancel',exact:true});if(await close.count())await close.click();else {const c=page.locator('dialog[open]').getByRole('button',{name:'Close',exact:true});if(await c.count())await c.click();}}catch{}}
  console.log(JSON.stringify({platform:source,passed:result.passed,state:result.state,status:result.status,saved:result.saved,error:result.error}));await persist();
 }
 report.passed=report.results.length===Object.keys(targets).length&&report.results.every(r=>r.passed);report.finished_at_utc=new Date().toISOString();await persist();
}catch(error){report.harness_error='Live test setup or harness failed: '+String(error?.message??error).split('?')[0].slice(0,500);await persist();console.log(report.harness_error);process.exitCode=1;}
finally{db?.close();if(browser)await browser.close();}
