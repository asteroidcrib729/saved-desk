// Inspect the one user-reported video in an isolated app; never alter its original.
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { randomUUID, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const project=resolve(import.meta.dirname,"../..");
const ownerDB=new DatabaseSync(resolve(process.env.LOCALAPPDATA,"com.saveddesk.desktop/prototype-catalog.db"),{readOnly:true});
const records=ownerDB.prepare("SELECT path FROM media_files WHERE path LIKE ?").all("%3981280655153515185.mp4");ownerDB.close();
if(records.length!==1)throw new Error("The reported video must resolve to one catalog record.");
const original=records[0].path,bytes=await readFile(original),hash=value=>createHash("sha256").update(value).digest("hex");
const before=hash(bytes),data=resolve(project,".cache/native-reported-video",randomUUID()),root=resolve(data,"selected");
await mkdir(root,{recursive:true});const copy=resolve(root,"reported.mp4");await writeFile(copy,bytes);
const port=await new Promise(done=>{const server=createServer();server.listen(0,"127.0.0.1",()=>{const port=server.address().port;server.close(()=>done(port));});});
const app=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk.exe"),[],{windowsHide:true,stdio:"ignore",env:{...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_REQUIRE_PACKAGED_WORKER:"1",WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
let browser,db;
try{
 for(let n=0;n<120;n++){if(app.exitCode!==null)throw new Error("Isolated app exited early.");try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(done=>setTimeout(done,250));}}
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];
 const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
 await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible();
 await invoke("save_settings",{settings:{downloadFolder:root,lowResource:true,quality:"original",profile:"original"}});
 db=new DatabaseSync(resolve(data,"prototype-catalog.db"));db.exec("PRAGMA busy_timeout=5000");
 db.prepare("INSERT INTO download_jobs(id,title,mode,state,destination,created_at,source,account_id,target) VALUES('owned-video','Reported video','new_only','completed',?,'2026-10-05T00:00:00Z','instagram','fixture','target')").run(root);
 const post=Number(db.prepare("INSERT INTO posts(source,account_id,native_id,creator,caption,kind,collection,saved_at,prototype) VALUES('instagram','fixture','reported','Fixture','Playback compatibility','video','Fixture','2026-10-05T00:00:00Z',0)").run().lastInsertRowid);
 const id=Number(db.prepare("INSERT INTO media_files(post_id,job_id,path,bytes,file_key) VALUES(?,'owned-video',?,?,'reported')").run(post,copy,bytes.length).lastInsertRowid);
 await page.reload();await expect(page.getByTestId("library-list").locator("article")).toHaveCount(1);
 // Read frame statistics only; do not capture or publish personal content images.
 const frameStats=async url=>page.evaluate(async url=>{
   const v=document.createElement("video");v.crossOrigin="anonymous";v.muted=true;v.src=url;v.style.display="none";document.body.append(v);
   try{
     await new Promise((done,reject)=>{const timer=setTimeout(()=>reject(new Error("Metadata timeout")),15000);v.onloadeddata=()=>{clearTimeout(timer);done();};v.onerror=()=>{clearTimeout(timer);reject(new Error("Decoder error"));};});
     v.currentTime=3;await new Promise(done=>{v.onseeked=done;setTimeout(done,3000);});
     await v.play();await new Promise(done=>setTimeout(done,600));v.pause();
     const canvas=document.createElement("canvas");canvas.width=32;canvas.height=32;canvas.getContext("2d").drawImage(v,0,0,32,32);
     const pixels=canvas.getContext("2d").getImageData(0,0,32,32).data;let brightness=0;for(let n=0;n<pixels.length;n+=4)brightness+=pixels[n]+pixels[n+1]+pixels[n+2];
     return {width:v.videoWidth,height:v.videoHeight,frames:v.getVideoPlaybackQuality().totalVideoFrames,mean:brightness/(32*32*3)};
   }catch(error){return {error:String(error)};}finally{v.pause();v.removeAttribute("src");v.load();v.remove();}
 },url);
 const raw=await frameStats(`http://savedmedia.localhost/${id}`);
 await expect.poll(async()=>{const ready=await invoke("check_readiness",{browser:"chrome"});return ready.checks.find(c=>c.id==="worker").state;},{timeout:45000}).toBe("ready");
 const preparationStarted=performance.now();const converted=await invoke("prepare_video",{id,force:false});const firstCopyMs=performance.now()-preparationStarted;expect(converted).toBe(true);
 const compatible=await frameStats(`http://savedmedia.localhost/${id}/playback`);
 expect(compatible.error).toBeUndefined();expect(compatible.width).toBe(1080);expect(compatible.height).toBe(1920);expect(compatible.frames).toBeGreaterThan(0);expect(compatible.mean).toBeGreaterThan(5);
 // The actual viewer automatically selects the prepared copy and can play/seek it.
 await page.getByRole("button",{name:"View saved files"}).click();const viewer=page.locator("video");
 await expect.poll(()=>viewer.evaluate(v=>v.readyState>=2),{timeout:30000}).toBe(true);
 expect(await viewer.getAttribute("src")).toContain("/playback");
 await viewer.evaluate(async v=>{v.muted=true;await v.play();});await expect.poll(()=>viewer.evaluate(v=>!v.paused&&v.currentTime>0)).toBe(true);
 await viewer.evaluate(v=>{v.pause();v.currentTime=5;});await expect.poll(()=>viewer.evaluate(v=>!v.seeking&&Math.abs(v.currentTime-5)<.2)).toBe(true);
 await page.getByRole("button",{name:"Close",exact:true}).click();
 const cache=resolve(root,".playback"),first=await readdir(cache);expect(first.filter(n=>n.endsWith(".mp4"))).toHaveLength(1);
 const cachedStarted=performance.now();expect(await invoke("prepare_video",{id,force:false})).toBe(true);const cachedCheckMs=performance.now()-cachedStarted;expect(cachedCheckMs).toBeLessThan(1000);expect(await readdir(cache)).toEqual(first);
 expect(hash(await readFile(original))).toBe(before);
 await writeFile(resolve(data,"acceptance.json"),JSON.stringify({originalUnchanged:true,originalBytes:bytes.length,raw,compatible,cacheReused:true,viewerPlaybackAndSeek:true,firstCopyMs,cachedCheckMs},null,2));
 process.stdout.write(`Reported video acceptance passed: original preserved, full-resolution H.264 playback/seek and cache reuse. Evidence: ${data}\n`);
}finally{
 db?.close();if(browser)await browser.close();if(app.pid&&app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});
 // Remove only media copies created by this isolated test; retain metadata evidence.
 await unlink(copy).catch(()=>{});for(const directory of [resolve(root,".playback"),resolve(root,".previews")])for(const name of await readdir(directory).catch(()=>[]))await unlink(resolve(directory,name));
}
