import {configureFixtureTools,stageFixtureApp} from "./fixture-tools.mjs";
// Packaged native integration with synthetic scoped sessions and loopback media.
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, unlink, writeFile, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createServer } from "node:http";
import { createServer as createPort } from "node:net";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const project=resolve(import.meta.dirname,"../..");
const data=resolve(project,".cache/native-soak",randomUUID());
await mkdir(data,{recursive:true});
const encoder=await configureFixtureTools(project,data);
const fixtureApp=await stageFixtureApp(project,data,"saveddesk-soak.exe");
const fixtureVideo=resolve(data,"fixture-video.mp4");
const encoded=spawnSync(encoder,["-nostdin","-hide_banner","-loglevel","error","-n","-f","lavfi","-i","testsrc=size=320x180:rate=12:duration=900","-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-t","900","-c:v","libx264","-preset","veryfast","-threads","1","-filter_threads","1","-c:a","aac","-pix_fmt","yuv420p",fixtureVideo],{windowsHide:true,timeout:120000});
if(encoded.status!==0)throw new Error("Packaged FFmpeg fixture generation failed.");
const fixtureImage=resolve(data,"fixture-image.jpg");
const imaged=spawnSync(encoder,["-nostdin","-hide_banner","-loglevel","error","-n","-i",fixtureVideo,"-frames:v","1","-vf","scale=320:180","-threads","1","-filter_threads","1",fixtureImage],{windowsHide:true,timeout:15000});
if(imaged.status!==0)throw new Error("Packaged FFmpeg image generation failed.");
const videoBytes=await readFile(fixtureVideo);const imageBytes=await readFile(fixtureImage);
const firefox=resolve(data,"firefox");const profileDirectory=resolve(firefox,"Profiles/test.default");await mkdir(profileDirectory,{recursive:true});
await writeFile(resolve(firefox,"profiles.ini"),"[Profile0]\nName=Isolated integration profile\nIsRelative=1\nPath=Profiles/test.default\n");
const profileDatabase=new DatabaseSync(resolve(profileDirectory,"cookies.sqlite"));
profileDatabase.exec("CREATE TABLE moz_cookies(name TEXT,value TEXT,host TEXT,path TEXT,expiry INTEGER,isSecure INTEGER,isHttpOnly INTEGER,originAttributes TEXT)");
const cookieInsert=profileDatabase.prepare("INSERT INTO moz_cookies VALUES(?,?,?,?,?,?,?,?)");
cookieInsert.run("sessionid","synthetic-firefox-secret",".instagram.com","/",4102444800,1,1,"");
cookieInsert.run("unrelated","unrelated-site-secret",".unrelated.test","/",4102444800,1,1,"");
profileDatabase.close();
const profileBefore=await readFile(resolve(profileDirectory,"cookies.sqlite"));
const media=[];
let items=Array.from({length:200},(_,i)=>({post:String(10000+Math.floor(i/2)),id:String(20000+i)}));
let delay=650;
const server=createServer((request,response)=>{
  if(request.url.startsWith("/viewer/")) {
    response.setHeader("Content-Type","application/json");
    response.end(JSON.stringify(request.url.endsWith("instagram")?{user:{pk:42,username:"fixture_user"}}:{users:[{user_id:"73",screen_name:"fixture_x"}]}));
  } else if(request.url==="/items") {response.end(JSON.stringify(items));}
  else if(request.url.startsWith("/media/")) {
    media.push(request.url);
    setTimeout(()=>{if(!response.destroyed){response.setHeader("Content-Type",request.url==="/media/401"?"video/mp4":"image/jpeg");response.end(request.url==="/media/401"?videoBytes:imageBytes);}},delay);
  } else {response.writeHead(404);response.end();}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const origin=`http://127.0.0.1:${server.address().port}`;
const port=await new Promise(done=>{const finder=createPort();finder.listen(0,"127.0.0.1",()=>{const value=finder.address().port;finder.close(()=>done(value));});});
const pipeSuffix=randomUUID();
const env={...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_REQUIRE_PACKAGED_WORKER:"1",SAVEDDESK_TEST_PLATFORM_ORIGIN:origin,SAVEDDESK_TEST_FIREFOX_ROOT:firefox,SAVEDDESK_TEST_PIPE_SUFFIX:pipeSuffix,WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`};
let app=spawn(fixtureApp.executable,[],{windowsHide:true,env,stdio:["ignore","pipe","pipe"]});
let output="";
for(const stream of [app.stdout,app.stderr]) stream.on("data",value=>{output=(output+value.toString()).slice(-4000);});
function nativeMessage(value,allowed=true){
  return new Promise((done,reject)=>{
    const child=spawn(fixtureApp.host,[allowed?"chrome-extension://chjglnciihblkjnhnpinocknamjoecim/":"chrome-extension://unapproved/"],{windowsHide:true,env,stdio:["pipe","pipe","pipe"]});
    let bytes=Buffer.alloc(0);
    child.stdout.on("data",chunk=>{bytes=Buffer.concat([bytes,chunk]);});
    child.on("error",reject);
    child.stdin.on("error",()=>{});
    child.on("exit",()=>{try {if(bytes.length<4){done(null);return;} const size=bytes.readUInt32LE(0);if(size!==bytes.length-4)throw new Error("Invalid native frame.");done(JSON.parse(bytes.subarray(4).toString()));}catch(error){reject(error);}});
    const payload=Buffer.from(JSON.stringify(value));const length=Buffer.alloc(4);length.writeUInt32LE(payload.length);child.stdin.end(Buffer.concat([length,payload]));
  });
}

let browser,database,page;
const samples=[],latencies=[],errors=[],requestCounts=[];let resumes=0,restarts=0,fullscreenCycles=0,playbackSeconds=0;
const reportPath=resolve(data,"acceptance.json");
const duration=Number(process.env.SAVEDDESK_SOAK_SECONDS||1800);if(!Number.isFinite(duration)||duration<900||duration>7200)throw Error("Soak duration must be 15-120 minutes");
const delayMs=ms=>new Promise(r=>setTimeout(r,ms));
const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
async function connect(){
 for(let n=0;n<180;n++){if(app.exitCode!==null)throw Error("Owned app exited: "+app.exitCode+" "+output);try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await delayMs(250);}}
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);page=browser.contexts()[0].pages()[0];page.on("pageerror",()=>errors.push("renderer-error"));await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible({timeout:45000});
}
async function stop(){if(browser)await browser.close();browser=null;if(app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});for(let n=0;n<40&&app.exitCode===null;n++)await delayMs(100);await delayMs(1500);}
async function openVideo(){
 await page.getByRole("button",{name:"Library",exact:true}).click();await page.getByRole("combobox",{name:"Library platform",exact:true}).selectOption("instagram");
 await page.getByRole("textbox",{name:"Search your library",exact:true}).fill("Long soak video");
 await expect(page.locator(".library-row").filter({hasText:"Long soak video"})).toHaveCount(1,{timeout:15000});
 await page.locator(".library-row").filter({hasText:"Long soak video"}).getByRole("button",{name:"View saved files",exact:true}).click();
 const video=page.locator(".media-stage video");await expect(video).toHaveCount(1);await expect.poll(()=>video.evaluate(v=>v.readyState>=2&&!v.error&&v.videoWidth>0),{timeout:20000}).toBe(true);
 if(await video.evaluate(v=>v.paused))await page.getByRole("button",{name:"Play video",exact:true}).click();
 const repeat=page.getByRole("button",{name:"Repeat video",exact:true});if(await repeat.getAttribute("aria-pressed")!=="true")await repeat.click();await expect.poll(()=>video.evaluate(v=>!v.paused&&v.loop)).toBe(true);
 return video;
}
function metrics(){
 const script=`$all=Get-CimInstance Win32_Process; $ids=@(${app.pid}); for($n=0;$n -lt 8;$n++){ $ids+=@($all|Where-Object { $ids -contains $_.ParentProcessId }|ForEach-Object ProcessId);$ids=@($ids|Select-Object -Unique) }; $processes=@(Get-Process -Id $ids -ErrorAction SilentlyContinue); @{rss=($processes|Measure-Object WorkingSet64 -Sum).Sum;private=($processes|Measure-Object PrivateMemorySize64 -Sum).Sum;processes=$processes.Count;cpu_seconds=($processes|Measure-Object CPU -Sum).Sum}|ConvertTo-Json -Compress`;
 const r=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{windowsHide:true,encoding:"utf8",timeout:20000});if(r.status!==0)throw Error("Owned process metrics unavailable");return JSON.parse(r.stdout);
}
let bulk,videoId;const jobs=[];let segment=0;const started=Date.now();let report={passed:false,duration_target_seconds:duration,scope:"One real native debug 0.2.7 process tree on this PC; synthetic private gallery and a 15-minute local MP4. No real provider polling or owner profile mutation.",samples,app_sha256:null};
try{
 await connect();database=new DatabaseSync(resolve(data,"prototype-catalog.db"));database.exec("PRAGMA busy_timeout=4000");
 const downloads=resolve(data,"downloads");await mkdir(downloads,{recursive:true});const snapshot=await invoke("get_snapshot");await invoke("save_settings",{settings:{...snapshot.settings,downloadFolder:downloads,lowResource:true,quality:"original",profile:"original"}});
 await invoke("begin_connection",{source:"instagram",browser:"chrome"});const pending=await nativeMessage({protocol_version:1,command:"request"});expect(pending.ok).toBe(true);
 expect((await nativeMessage({protocol_version:1,command:"authorize",nonce:pending.nonce,source:"instagram",browser:"chrome",cookies:[{domain:".instagram.com",name:"sessionid",value:"synthetic-soak-secret",path:"/",secure:true,httpOnly:true}]})).ok).toBe(true);
 await expect.poll(()=>database.prepare("SELECT state FROM accounts WHERE source='instagram'").get()?.state,{timeout:65000}).toBe("connected");
 const localVideo=resolve(downloads,"soak/long.mp4");await mkdir(dirname(localVideo),{recursive:true});await copyFile(fixtureVideo,localVideo);
 database.prepare("INSERT INTO download_jobs(id,title,mode,state,destination,created_at,source,account_id,target) VALUES('soak-video','Long video','new_only','completed',?,'2026-10-08','instagram','42','local fixture')").run(dirname(localVideo));
 const post=Number(database.prepare("INSERT INTO posts(source,account_id,native_id,creator,caption,kind,collection,saved_at,prototype) VALUES('instagram','42','9000001','Synthetic fixture','Long soak video','video','Soak','2099-01-01T00:00:00Z',0)").run().lastInsertRowid);
 videoId=Number(database.prepare("INSERT INTO media_files(post_id,job_id,path,bytes,file_key) VALUES(?,'soak-video',?,?,'9000001')").run(post,localVideo,videoBytes.length).lastInsertRowid);
 const draft=await invoke("prepare_download",{request:{source:"instagram",target:"https://www.instagram.com/fixture_user/saved/soak/123456789/",title:"Sustained synthetic private gallery",quality:"original",profile:"original"}});bulk=await invoke("start_download",{token:draft.token,mode:"new_only"});jobs.push(bulk);
 await page.reload();await page.getByRole("heading",{name:"Library",exact:true}).waitFor();let video=await openVideo();const runStart=Date.now();let nextSample=0,lastTime=0;
 const pauseAt=[180,360,780,960];let pauseIndex=0;const restartAt=[600,1200];let restartIndex=0;
 while((Date.now()-runStart)/1000<duration){
  const elapsed=(Date.now()-runStart)/1000;
  const playback=await video.evaluate(v=>({time:v.currentTime,paused:v.paused,error:!!v.error,frames:v.getVideoPlaybackQuality().totalVideoFrames,width:v.videoWidth}));expect(playback.error).toBe(false);expect(playback.paused).toBe(false);expect(playback.width).toBe(320);
  playbackSeconds+=playback.time>=lastTime?playback.time-lastTime:900-lastTime+playback.time;lastTime=playback.time;
  const begin=performance.now();const state=await invoke("get_snapshot");latencies.push(performance.now()-begin);expect(state.native).toBe(true);
  let job=database.prepare("SELECT state,saved,failed FROM download_jobs WHERE id=?").get(bulk);
  if(job.state==='completed'&&segment<5){
    segment++;items=Array.from({length:200},(_,i)=>({post:String(10000+segment*100+Math.floor(i/2)),id:String(20000+segment*200+i)}));
    const next=await invoke('prepare_download',{request:{source:'instagram',target:`https://www.instagram.com/fixture_user/saved/soak/${123456789+segment}/`,title:`Synthetic soak batch ${segment+1}`,quality:'original',profile:'original'}});
    bulk=await invoke('start_download',{token:next.token,mode:'new_only'});jobs.push(bulk);job=database.prepare('SELECT state,saved,failed FROM download_jobs WHERE id=?').get(bulk);
  }
  const savedTotal=jobs.reduce((total,id)=>total+database.prepare('SELECT saved FROM download_jobs WHERE id=?').get(id).saved,0);expect(["running","queued","completed"].includes(job.state)).toBe(true);expect(job.failed).toBe(0);
  if(pauseIndex<pauseAt.length&&elapsed>=pauseAt[pauseIndex]){
   pauseIndex++;if(job.state==='running'){await invoke('stop_download',{id:bulk,pause:true});await invoke('resume_download',{id:bulk});resumes++;}
  }
  if(restartIndex<restartAt.length&&elapsed>=restartAt[restartIndex]){
   restartIndex++;await stop();app=spawn(fixtureApp.executable,[],{windowsHide:true,env,stdio:["ignore","pipe","pipe"]});output="";for(const stream of [app.stdout,app.stderr])stream.on("data",value=>{output=(output+value.toString()).slice(-4000);});await connect();restarts++;
   const recovered=database.prepare("SELECT state FROM download_jobs WHERE id=?").get(bulk);if(['paused','interrupted','failed'].includes(recovered.state)){await invoke('resume_download',{id:bulk});resumes++;}
   video=await openVideo();await video.evaluate((v,time)=>{v.currentTime=time;},lastTime);
  }
  if(elapsed>=nextSample){
   nextSample=elapsed+30;const measured=metrics();samples.push({seconds:Math.round(elapsed),...measured,saved:savedTotal,video_frames:playback.frames});
   await page.mouse.move(700,450);await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);await delayMs(250);await page.mouse.move(720,460);await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);fullscreenCycles++;
   report={...report,elapsed_seconds:Math.round(elapsed),samples,latency_samples:latencies.length,resumes,restarts,fullscreen_cycles:fullscreenCycles,playback_seconds:Math.round(playbackSeconds),saved:savedTotal};await writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({seconds:Math.round(elapsed),saved:savedTotal,rss_mb:Math.round(measured.rss/1048576),resumes,restarts}));
  }
  await delayMs(1000);
 }
 await expect.poll(()=>database.prepare("SELECT state FROM download_jobs WHERE id=?").get(bulk).state,{timeout:600000}).toBe('completed');
 const job=database.prepare("SELECT * FROM download_jobs WHERE id=?").get(bulk);expect(job.saved).toBe(200);expect(jobs.length).toBe(6);expect(job.failed).toBe(0);
 expect(jobs.reduce((total,id)=>total+database.prepare("SELECT count(*) n FROM media_files WHERE job_id=?").get(id).n,0)).toBe(1200);expect(database.prepare("PRAGMA integrity_check").get().integrity_check).toBe('ok');
 expect(errors).toHaveLength(0);expect(restarts).toBe(2);expect(resumes).toBeGreaterThanOrEqual(2);expect(fullscreenCycles).toBeGreaterThan(40);expect(playbackSeconds).toBeGreaterThan(duration*.85);
 const sorted=[...latencies].sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)];expect(p95).toBeLessThan(1500);
 const mature=samples.filter(s=>s.seconds>=600),early=mature.slice(0,10),late=mature.slice(-10);const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];const growth=median(late.map(s=>s.private))-median(early.map(s=>s.private));expect(growth).toBeLessThan(256*1048576);
 const {createHash}=await import('node:crypto');report={...report,passed:true,elapsed_seconds:Math.round((Date.now()-runStart)/1000),api_p95_ms:Math.round(p95),private_memory_growth_mb:Math.round(growth/1048576),max_rss_mb:Math.round(Math.max(...samples.map(s=>s.rss))/1048576),samples,latency_samples:latencies.length,files:1200,resumes,restarts,fullscreen_cycles:fullscreenCycles,playback_seconds:Math.round(playbackSeconds),app_sha256:createHash('sha256').update(await readFile(fixtureApp.executable)).digest('hex')};await writeFile(reportPath,JSON.stringify(report,null,2));console.log('Sustained native soak passed:',data);
}catch(error){report.error=String(error?.message??error);report.elapsed_seconds=Math.round((Date.now()-started)/1000);await writeFile(reportPath,JSON.stringify(report,null,2));console.error(error);process.exitCode=1;}
finally{database?.close();await stop();server.closeAllConnections();server.close();}
