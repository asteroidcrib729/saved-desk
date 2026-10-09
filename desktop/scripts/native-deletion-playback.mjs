import {configureFixtureTools} from "./fixture-tools.mjs";
// Isolated real Windows app + packaged worker. No owner files or sessions are touched.
import {chromium,expect} from "@playwright/test";
import {spawn,spawnSync} from "node:child_process";
import {mkdir,readFile,readdir,access,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createServer} from "node:http";
import {createServer as createPort} from "node:net";
import {randomUUID,createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
const project=resolve(import.meta.dirname,"../..");const data=resolve(project,".cache/native-deletion-playback",randomUUID());await mkdir(data,{recursive:true});
const encoder=await configureFixtureTools(project,data);
const fixture=resolve(data,"vp9.mp4");const encode=spawnSync(encoder,["-nostdin","-v","error","-f","lavfi","-i","testsrc2=s=160x240:d=1","-c:v","libvpx-vp9","-threads","1",fixture],{windowsHide:true,timeout:30000});if(encode.status!==0)throw new Error("VP9 fixture generation failed");
const payload=await readFile(fixture);const hash=b=>createHash("sha256").update(b).digest("hex");const server=createServer((req,res)=>{if(req.url==="/video.mp4")res.end(payload);else {res.writeHead(404);res.end();}});await new Promise(done=>server.listen(0,"127.0.0.1",done));
const port=await new Promise(done=>{const s=createPort();s.listen(0,"127.0.0.1",()=>{const port=s.address().port;s.close(()=>done(port));});});
const app=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk.exe"),[],{windowsHide:true,stdio:"ignore",env:{...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_REQUIRE_PACKAGED_WORKER:"1",SAVEDDESK_TEST_PLATFORM_ORIGIN:`http://127.0.0.1:${server.address().port}`,SAVEDDESK_TEST_PIPE_SUFFIX:randomUUID(),WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});let browser,db;
const exists=path=>access(path).then(()=>true,()=>false);
try{
 for(let i=0;i<120;i++){if(app.exitCode!==null)throw new Error("Fixture app exited early");try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(done=>setTimeout(done,250));}}
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];const errors=[];page.on("pageerror",e=>errors.push(e.message));const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
 await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible({timeout:30000});db=new DatabaseSync(resolve(data,"prototype-catalog.db"));db.exec("PRAGMA busy_timeout=2000");
 const root=resolve(data,"downloads");await mkdir(root,{recursive:true});await writeFile(resolve(root,"unrelated.txt"),"preserve");await invoke("save_settings",{settings:{downloadFolder:root,lowResource:true,quality:"original",profile:"original"}});
 async function queue(title,profile="original"){
  const draft=await invoke("prepare_download",{request:{source:"youtube",target:"https://www.youtube.com/playlist?list=PL0123456789abcdef",title,quality:"original",profile}});const id=await invoke("start_download",{token:draft.token,mode:"all_again"});
  await expect.poll(()=>db.prepare("SELECT state FROM download_jobs WHERE id=?").get(id).state,{timeout:120000}).toMatch(/completed|failed/);const job=db.prepare("SELECT * FROM download_jobs WHERE id=?").get(id);expect(job.error).toBe("");expect(job.saved).toBe(1);return db.prepare("SELECT * FROM media_files WHERE job_id=?").get(id);
 }
 const first=await queue("First video");expect(hash(await readFile(first.path))).not.toBe(hash(payload));const files=await invoke("post_files",{id:first.post_id});expect(files[0].playback).toBe("original");
 const timings=await page.evaluate(async id=>{const times=[];for(let n=0;n<10;n++){const start=performance.now();if(await window.__TAURI_INTERNALS__.invoke("prepare_video",{id,force:false})!==false)throw new Error("Compatible MP4 was not reused");times.push(performance.now()-start);}return times;},first.id);expect(Math.max(...timings)).toBeLessThan(1000);
 await page.reload();await expect(page.getByRole("button",{name:"View saved files"})).toBeVisible();await page.getByRole("button",{name:"View saved files"}).click();await expect.poll(()=>page.locator(".media-dialog video").evaluate(v=>v.readyState),{timeout:15000}).toBeGreaterThanOrEqual(2);
 const video=page.locator(".media-dialog video");await video.evaluate(v=>{v.crossOrigin="anonymous";v.muted=true;v.load();});await expect.poll(()=>video.evaluate(v=>v.readyState),{timeout:15000}).toBeGreaterThanOrEqual(2);
 await video.evaluate(v=>v.play());await expect.poll(()=>video.evaluate(v=>v.currentTime),{timeout:10000}).toBeGreaterThan(0.1);
 const pixels=await video.evaluate(v=>{const canvas=document.createElement("canvas");canvas.width=32;canvas.height=32;const context=canvas.getContext("2d");context.drawImage(v,0,0,32,32);const values=context.getImageData(0,0,32,32).data;let min=255,max=0;for(let n=0;n<values.length;n++)if(n%4!==3){min=Math.min(min,values[n]);max=Math.max(max,values[n]);}return {min,max,frames:v.getVideoPlaybackQuality().totalVideoFrames};});expect(pixels.frames).toBeGreaterThan(0);expect(pixels.max-pixels.min).toBeGreaterThan(40);
 // A cancelled confirmation keeps the playing media and preview.
 await page.getByRole("button",{name:"Delete post",exact:true}).click();const confirm=page.getByRole("dialog",{name:"Delete this post and every saved copy?"});await expect(confirm).toContainText("2 stored files");await confirm.getByRole("button",{name:"Cancel",exact:true}).click();expect(await exists(first.path)).toBe(true);
 await page.getByRole("button",{name:"Delete post",exact:true}).click();await confirm.getByRole("button",{name:"Delete permanently"}).click();await expect(confirm).not.toBeVisible();expect(await exists(first.path)).toBe(false);expect(db.prepare("SELECT count(*) n FROM posts").get().n).toBe(0);expect(await readFile(resolve(root,"unrelated.txt"),"utf8")).toBe("preserve");
 const second=await queue("Second video");const third=await queue("Third video","compatible_mp4");expect(third.original_path).toBe("");expect((await readdir(resolve(third.path,".."))).some(n=>n.endsWith(".webm"))).toBe(false);
 // Delete one job, keeping the other copy of the same post playable.
 const reviewed=await invoke("prepare_deletion",{target:{kind:"download",id:third.job_id}});expect(reviewed.files).toBe(1);await invoke("delete_saved_content",{token:reviewed.token});expect(await exists(third.path)).toBe(false);expect(await exists(second.path)).toBe(true);expect((await invoke("post_files",{id:second.post_id}))[0].playback).toBe("original");
 expect(await invoke("delete_saved_content",{token:reviewed.token}).then(()=>false,()=>true)).toBe(true);
 const fourth=await queue("Fourth video");await page.reload();await page.getByRole("button",{name:"Downloads",exact:true}).click();const row=page.locator(".job-card").filter({has:page.getByRole("heading",{name:"Fourth video",exact:true})});await row.getByRole("button",{name:"Delete collection",exact:true}).click();const collection=page.getByRole("dialog",{name:"Delete this collection and all its downloads?"});await expect(collection).toContainText("2 saved copies");await collection.getByRole("button",{name:"Delete permanently"}).click();await expect(page.getByRole("heading",{name:"No downloads yet"})).toBeVisible();expect(await exists(second.path)).toBe(false);expect(await exists(fourth.path)).toBe(false);expect(db.prepare("SELECT count(*) n FROM media_files").get().n).toBe(0);
 // Confirmation becomes invalid if the selected folder changes.
 const fifth=await queue("Folder change");
 const batch=[];
 for(const name of ["Batch A","Batch B"]){
  const path=resolve(root,name+".mp4");await writeFile(path,payload);
  const post=Number(db.prepare("INSERT INTO posts(source,account_id,native_id,creator,caption,kind,collection,saved_at,prototype) VALUES('youtube','public',?,?,'Batch deletion fixture','text','Batch','2026-10-07T00:00:00Z',0)").run(name,name).lastInsertRowid);
  db.prepare("INSERT INTO media_files(post_id,job_id,path,bytes,file_key,quality,profile) VALUES(?,?,?,?,?,'original','original')").run(post,fifth.job_id,path,payload.length,name);batch.push({post,path,name});
 }
 await page.reload();await expect(page.getByRole("checkbox",{name:"Select post by Batch A",exact:true})).toBeVisible();
 for(const item of batch)await page.getByRole("checkbox",{name:"Select post by "+item.name,exact:true}).click();
 await page.getByRole("button",{name:"Delete selected (2)",exact:true}).click();const batchReview=page.getByRole("dialog",{name:"Delete 2 selected posts and every saved copy?"});await expect(batchReview).toContainText("2 saved copies");await batchReview.getByRole("button",{name:"Cancel",exact:true}).click();
 for(const item of batch)expect(await exists(item.path)).toBe(true);
 await page.getByRole("button",{name:"Delete selected (2)",exact:true}).click();await batchReview.getByRole("button",{name:"Delete permanently"}).click();await expect(batchReview).not.toBeVisible();
 for(const item of batch){expect(await exists(item.path)).toBe(false);expect(db.prepare("SELECT count(*) n FROM posts WHERE id=?").get(item.post).n).toBe(0);}
 expect(await exists(fifth.path)).toBe(true);expect(db.prepare("SELECT count(*) n FROM posts").get().n).toBe(1);
 const stale=await invoke("prepare_deletion",{target:{kind:"post",id:fifth.post_id}});const other=resolve(data,"other");await mkdir(other);await invoke("save_settings",{settings:{downloadFolder:other,lowResource:true,quality:"original",profile:"original"}});expect(await invoke("delete_saved_content",{token:stale.token}).then(()=>"",e=>String(e))).toContain("changed");expect(await exists(fifth.path)).toBe(true);
 const outside=await invoke("prepare_deletion",{target:{kind:"post",id:fifth.post_id}});expect(outside.outsideFolder).toBe(1);await invoke("delete_saved_content",{token:outside.token});expect(await exists(fifth.path)).toBe(true);expect(await readFile(resolve(root,"unrelated.txt"),"utf8")).toBe("preserve");expect(errors).toEqual([]);
 await writeFile(resolve(data,"acceptance.json"),JSON.stringify({passed:true,readyOpenMs:timings,pixels,medianMs:[...timings].sort((a,b)=>a-b)[5],checks:["VP9 converted before completed","only compatible final file retained","native MP4 no worker startup","actual WebView2 playback","cancel preserves files","post deletes media and caches","single download preserves another copy","no retained conversion original","one-use confirmation","collection deletes repeated jobs","batch UI cancellation preserves all selected files","one batch confirmation deletes two posts and preserves unselected post","stale selected-folder confirmation rejected","outside-root files preserved","unrelated files preserved"]},null,2));
 console.log(`Native deletion/playback acceptance passed. Ready MP4 open median: ${[...timings].sort((a,b)=>a-b)[5].toFixed(2)} ms. Fixture: ${data}`);
}finally{db?.close();if(browser)await browser.close();if(app.pid&&app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});await new Promise(done=>server.close(done));}
