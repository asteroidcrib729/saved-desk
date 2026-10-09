import {configureFixtureTools} from "./fixture-tools.mjs";
import {chromium,expect} from "@playwright/test";
import {spawn,spawnSync} from "node:child_process";
import {mkdir,readFile,writeFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {createServer} from "node:http";
import {createServer as createPort} from "node:net";
import {randomUUID,createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
const project=resolve(import.meta.dirname,"../.."),data=resolve(project,".cache/native-codec-matrix",randomUUID());await mkdir(data,{recursive:true});
const encoder=await configureFixtureTools(project,data),python=resolve(project,".venv/Scripts/python.exe");
const generated=spawnSync(python,[resolve(project,"packaging/generate-codec-fixtures.py"),resolve(data,"inputs")],{windowsHide:true,encoding:"utf8",timeout:180000,env:{...process.env,SAVEDDESK_FFMPEG:encoder}});
if(generated.status!==0)throw Error(generated.stderr||generated.stdout);
const fixtures=JSON.parse(await readFile(resolve(data,"inputs/fixtures.json"),"utf8")),payloads=new Map(),items=[];
for(const [index,c] of fixtures.cases.entries()){payloads.set(String(index+1000),await readFile(c.file));items.push({post:String(index+1000),id:String(index+1000),extension:c.extension});}
const firefox=resolve(data,"firefox"),profile=resolve(firefox,"Profiles/test.default");await mkdir(profile,{recursive:true});
await writeFile(resolve(firefox,"profiles.ini"),"[Profile0]\nName=Isolated codec matrix\nIsRelative=1\nPath=Profiles/test.default\n");
const cookies=new DatabaseSync(resolve(profile,"cookies.sqlite"));cookies.exec("CREATE TABLE moz_cookies(name TEXT,value TEXT,host TEXT,path TEXT,expiry INTEGER,isSecure INTEGER,isHttpOnly INTEGER,originAttributes TEXT)");cookies.prepare("INSERT INTO moz_cookies VALUES(?,?,?,?,?,?,?,?)").run("sessionid","synthetic-codec-matrix",".instagram.com","/",4102444800,1,1,"");cookies.close();
const requests=[];
const server=createServer((req,res)=>{if(req.url==="/viewer/instagram")res.end(JSON.stringify({user:{pk:42,username:"fixture_user"}}));else if(req.url==="/items")res.end(JSON.stringify(items));else if(req.url.startsWith("/media/")){requests.push(req.url);const bytes=payloads.get(req.url.split("/").at(-1));res.setHeader("Content-Length",bytes.length);res.end(bytes);}else{res.writeHead(404);res.end();}});await new Promise(d=>server.listen(0,"127.0.0.1",d));
const port=await new Promise(d=>{const s=createPort();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>d(p));});});
const disabled=process.env.SAVEDDESK_QA_DISABLE_GPU==="1";
const env={...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_TEST_PLATFORM_ORIGIN:`http://127.0.0.1:${server.address().port}`,SAVEDDESK_TEST_FIREFOX_ROOT:firefox,SAVEDDESK_REQUIRE_PACKAGED_WORKER:"1",SAVEDDESK_TEST_PIPE_SUFFIX:randomUUID(),WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}${disabled?" --disable-gpu":""}`};
// Deliberate missing-tool case must exclude the host's WindowsApps FFmpeg alias.
for(const key of ["SAVEDDESK_GALLERY_PYTHON","SAVEDDESK_FFMPEG","SAVEDDESK_NODE","PYTHONPATH","PYTHONHOME","VIRTUAL_ENV"])delete env[key];
env.PATH=`${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
const app=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk.exe"),[],{windowsHide:true,env,stdio:"ignore"});let browser,db;const results=[];
try{
 for(let i=0;i<120;i++){if(app.exitCode!==null)throw Error("Codec app exited");try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(d=>setTimeout(d,250));}}
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];await page.bringToFront();
 const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
 await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible({timeout:30000});
 const root=resolve(data,"downloads");await mkdir(root,{recursive:true});await invoke("save_settings",{settings:{downloadFolder:root,lowResource:true,quality:"original",profile:"original"}});
 await page.getByRole("button",{name:"Accounts",exact:true}).click();await page.getByRole("combobox",{name:"Browser",exact:true}).selectOption("firefox");await expect(page.getByRole("combobox",{name:"Firefox profile",exact:true})).toContainText("Isolated codec matrix");
 const account=page.locator(".account-card").filter({has:page.getByRole("heading",{name:"Instagram",exact:true})});await account.getByRole("button",{name:"Connect using this browser",exact:true}).click();await expect(account.getByText("Connected as @fixture_user",{exact:true})).toBeVisible({timeout:65000});
 db=new DatabaseSync(resolve(data,"prototype-catalog.db"),{readOnly:true});db.exec("PRAGMA busy_timeout=2000");
 for(const mode of ["auto","software"]){
  const draft=await invoke("prepare_download",{request:{source:"instagram",target:"",title:`Codec matrix ${mode}`,quality:"original",profile:"original",advanced:{encoder:mode,preset:"superfast",crf:23,audioBitrate:128}}});
  const started=performance.now(),id=await invoke("start_download",{token:draft.token,mode:"all_again"});
  await expect.poll(()=>["completed","failed","interrupted"].includes(db.prepare("SELECT state FROM download_jobs WHERE id=?").get(id).state),{timeout:150000}).toBe(true);
  const job=db.prepare("SELECT * FROM download_jobs WHERE id=?").get(id);expect(job.state,job.error).toBe("completed");expect(job.saved).toBe(fixtures.cases.length);expect(job.failed).toBe(0);
  const files=db.prepare("SELECT m.*,p.native_id FROM media_files m JOIN posts p ON m.post_id=p.id WHERE job_id=? ORDER BY native_id").all(id);expect(files).toHaveLength(fixtures.cases.length);
  for(const file of files){
   const fixture=fixtures.cases[Number(file.native_id)-1000];expect(file.path.endsWith(".mp4")).toBe(true);
   const metadata=spawnSync(encoder,["-nostdin","-hide_banner","-i",file.path],{windowsHide:true,encoding:"utf8",timeout:15000}).stderr;
   const line=metadata.split("\n").find(l=>l.includes("Video:"));expect(line).toContain("h264");expect(line).toMatch(/yuv420p[, (]/);expect(line).not.toContain("yuv420p10");
   if(fixture.name==="h264-aac"||fixture.name==="h264-silent")expect(createHash("sha256").update(await readFile(file.path)).digest("hex")).toBe(createHash("sha256").update(await readFile(fixture.file)).digest("hex"));
   const pixels=await page.evaluate(async id=>{
    const v=document.createElement("video");v.crossOrigin="anonymous";v.muted=true;v.src=`http://savedmedia.localhost/${id}`;v.style.cssText="position:fixed;left:180px;top:120px;width:160px;height:240px;z-index:9999";document.body.append(v);
    try{await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(Error("decode timeout")),12000);v.onloadeddata=()=>{clearTimeout(timer);ok();};v.onerror=()=>{clearTimeout(timer);fail(Error("media error "+v.error?.code));};});await v.play();await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(Error("No presented video frame")),8000);v.requestVideoFrameCallback(()=>{clearTimeout(timer);ok();});});
     const c=document.createElement("canvas");c.width=32;c.height=32;const ctx=c.getContext("2d");ctx.drawImage(v,0,0,32,32);const bytes=ctx.getImageData(0,0,32,32).data;let min=255,max=0;for(let i=0;i<bytes.length;i++)if(i%4!==3){min=Math.min(min,bytes[i]);max=Math.max(max,bytes[i]);}return {min,max,time:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames};
    }finally{v.pause();v.removeAttribute("src");v.load();v.remove();}
   },file.id);expect(pixels.frames,JSON.stringify({name:fixture.name,mode,pixels})).toBeGreaterThan(0);expect(pixels.max-pixels.min).toBeGreaterThan(20);
   results.push({name:fixture.name,encoder:mode,encodedWith:metadata.match(/encoder\s*:\s*(.*(?:libx264|h264_qsv|h264_nvenc|h264_amf).*)/)?.[1]?.trim()??"stream-copy-or-unreported",passed:true,pixels});
  }
  expect((await readdir(job.destination,{withFileTypes:true})).filter(f=>f.isFile()?!f.name.endsWith(".mp4"):f.name!==".previews").map(f=>f.name)).toEqual([]);console.log(`${mode}: ${fixtures.cases.length} real codec/container inputs downloaded, finalized and WebView-decoded in ${((performance.now()-started)/1000).toFixed(1)}s`);
 }
 // Previously completed compatible media stays playable without any external tools.
 await invoke("save_external_tools",{config:{galleryPython:"",ffmpeg:""}});
 const file=db.prepare("SELECT id FROM media_files LIMIT 1").get();expect(await invoke("prepare_video",{id:file.id,force:false})).toBe(false);
 const readiness=await invoke("check_readiness",{browser:"chrome"});expect(readiness.checks.find(c=>c.id==="worker").state).toBe("ready");expect(readiness.checks.find(c=>c.id==="ffmpeg").state).not.toBe("ready");
 expect(requests).toHaveLength(fixtures.cases.length*2);
 await writeFile(resolve(data,"acceptance.json"),JSON.stringify({passed:true,rendering:disabled?"GPU disabled":"host default",runtime:(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json())).Browser,hardware_encoding:fixtures.hardware_encoding,hardware_probe_seconds:fixtures.hardware_probe_seconds,results,checks:["real frozen worker and external gallery process",`${results.length} native codec/container decoding cases`,"no incompatible originals","compatible source hashes unchanged","completed MP4 usable without external tools"]},null,2));
 console.log(`Native codec matrix passed: ${data}`);
}finally{db?.close();if(browser)await browser.close();if(app.pid&&app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});await new Promise(d=>server.close(d));}
