// First-run, recovery and persistence through actual frozen worker + WebView2.
import {chromium,expect} from '@playwright/test';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {configureFixtureTools} from './fixture-tools.mjs';
const project=resolve(import.meta.dirname,'../..');
const data=resolve(project,'.cache/native-external-tools',randomUUID());await mkdir(data,{recursive:true});
await configureFixtureTools(project,data);const configPath=resolve(data,'external-tools.json');
const configured=JSON.parse(await readFile(configPath,'utf8'));await unlink(configPath);
const env={...process.env};for(const key of ['SAVEDDESK_GALLERY_PYTHON','SAVEDDESK_FFMPEG','SAVEDDESK_NODE','PYTHONPATH','PYTHONHOME','VIRTUAL_ENV'])delete env[key];
env.PATH=`${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
let app,browser,page,db;const errors=[],timings=[];
async function stop(){await browser?.close();browser=null;if(app?.pid&&app.exitCode===null)spawnSync('taskkill.exe',['/PID',String(app.pid),'/T','/F'],{windowsHide:true});}
async function start(){
 const port=await new Promise(done=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>done(port));});});
 app=spawn(resolve(project,'desktop/src-tauri/target/debug/saveddesk.exe'),[],{windowsHide:true,stdio:'ignore',env:{...env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_REQUIRE_PACKAGED_WORKER:'1',WEBVIEW2_USER_DATA_FOLDER:resolve(data,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
 for(let n=0;n<120;n++){if(app.exitCode!==null)throw Error('App exited before first-run check');try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(done=>setTimeout(done,250));}}
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);page=browser.contexts()[0].pages()[0];page.on('pageerror',e=>errors.push(e.message));
 await expect(page.getByRole('heading',{name:'Library',exact:true})).toBeVisible();
}
const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
async function readiness(){const start=performance.now();const r=await invoke('check_readiness',{browser:'chrome'});timings.push(performance.now()-start);return Object.fromEntries(r.checks.map(c=>[c.id,c]));}
try{
 await start();db=new DatabaseSync(resolve(data,'prototype-catalog.db'));db.exec('PRAGMA busy_timeout=5000');
 const selected=resolve(data,'selected');await mkdir(selected,{recursive:true});await invoke('save_settings',{settings:{downloadFolder:selected,lowResource:true,quality:'original',profile:'original'}});
 expect(await invoke('get_external_tools')).toEqual({galleryPython:'',ffmpeg:''});
 let ready=await readiness();expect(ready.worker.state).toBe('ready');expect(ready.youtube.state).toBe('ready');expect(ready.gallery.state).toBe('blocked');expect(ready.ffmpeg.state).toBe('warning');
 await page.getByRole('button',{name:'Try sample collection'}).click();await expect(page.getByTestId('library-list').locator('article')).toHaveCount(3,{timeout:30000});
 const reject=async config=>{const r=await invoke('save_external_tools',{config}).then(()=>null,e=>String(e));expect(r).not.toBeNull();return r;};
 expect(await reject({galleryPython:'relative.exe',ffmpeg:''})).toContain('existing executable');expect(await reject({galleryPython:resolve(data,'missing.exe'),ffmpeg:''})).toContain('existing executable');
 const fake=resolve(data,'not-a-program.exe');await writeFile(fake,'invalid executable');await invoke('save_external_tools',{config:{galleryPython:fake,ffmpeg:fake}});
 ready=await readiness();expect(ready.worker.state).toBe('ready');expect(ready.gallery.state).toBe('blocked');expect(ready.ffmpeg.state).toBe('warning');
 await invoke('save_external_tools',{config:configured});ready=await readiness();expect(ready.gallery.state).toBe('ready');expect(ready.ffmpeg.state).toBe('ready');
 db.prepare("INSERT INTO download_jobs(id,title,mode,state,destination,created_at,source,account_id,target) VALUES('tool-busy','Busy tool change','new_only','queued',?,'2026-10-08T00:00:00Z','instagram','fixture','target')").run(selected);
 expect(await reject({galleryPython:'',ffmpeg:''})).toContain('Finish or pause');db.prepare("DELETE FROM download_jobs WHERE id='tool-busy'").run();
 await stop();await start();expect(await invoke('get_external_tools')).toEqual(configured);ready=await readiness();expect(ready.gallery.state).toBe('ready');
 await invoke('save_external_tools',{config:{galleryPython:'',ffmpeg:''}});ready=await readiness();expect(ready.gallery.state).toBe('blocked');expect(ready.ffmpeg.state).toBe('warning');
 await writeFile(configPath,'{broken');ready=await readiness();expect(ready.worker.state).toBe('blocked');
 await invoke('save_external_tools',{config:configured});ready=await readiness();expect(ready.worker.state).toBe('ready');expect(ready.gallery.state).toBe('ready');
 expect(db.prepare('SELECT COUNT(*) AS n FROM posts').get().n).toBe(3);expect(errors).toEqual([]);
 await writeFile(resolve(data,'acceptance.json'),JSON.stringify({passed:true,checks:['clean process environment, no developer PATH/Python fallback','core sample transfers without external tools','missing tools explicitly reported','invalid and relative executable handling','invalid executable fails safely','configured external tools work with minimal PATH','busy queue blocks tool changes','configuration survives process restart','clearing selection disables gallery and conversion','corrupt configuration recovers without catalog loss'],setupCheckMs:timings,pageErrors:errors},null,2));
 console.log(`Native external-tool first-run/recovery acceptance passed. Isolated data: ${data}`);
}finally{db?.close();await stop();}
