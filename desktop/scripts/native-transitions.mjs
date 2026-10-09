import {configureFixtureTools} from "./fixture-tools.mjs";
// Packaged WebView2 acceptance: local playback, moved-file repair and folder isolation.
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const project=resolve(import.meta.dirname,"../..");
const data=resolve(project,".cache/native-transitions",randomUUID());await mkdir(data,{recursive:true});
const old=resolve(data,"selected");await mkdir(old,{recursive:true});
const encoder=await configureFixtureTools(project,data);
const img=resolve(old,"instagram/downloads/job-image/101.jpg");
const vid=resolve(old,"instagram/downloads/job-video/201.mp4");
for(const file of [img,vid])await mkdir(dirname(file),{recursive:true});
function encode(args){const result=spawnSync(encoder,["-nostdin","-hide_banner","-loglevel","error",...args],{windowsHide:true,encoding:"utf8",timeout:60000});if(result.status!==0)throw new Error("Media fixture generation failed: "+result.stderr);}
encode(["-f","lavfi","-i","color=c=teal:s=320x1600","-frames:v","1","-threads","1",img]);
encode(["-f","lavfi","-i","testsrc=size=640x360:rate=15","-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=44100","-c:a","aac","-vf","noise=alls=50:allf=t","-t","4","-c:v","libx264","-pix_fmt","yuv420p","-preset","ultrafast","-crf","10","-threads","1","-movflags","+faststart",vid]);
const image=await readFile(img),video=await readFile(vid);
if(video.length<=2*1024*1024)throw new Error("Video fixture must exercise more than one native range chunk.");
const port=await new Promise(done=>{const server=createServer();server.listen(0,"127.0.0.1",()=>{const port=server.address().port;server.close(()=>done(port));});});
const app=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk.exe"),[],{windowsHide:true,stdio:"ignore",env:{...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_REQUIRE_PACKAGED_WORKER:"1",WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
let browser,db;
try{
  for(let n=0;n<120;n++){if(app.exitCode!==null)throw new Error("Isolated media app exited early.");try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(done=>setTimeout(done,250));}}
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];if(!page)throw new Error("Media window unavailable.");
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
  await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible();
  const settings={downloadFolder:old,lowResource:true,quality:"original",profile:"original"};await invoke("save_settings",{settings});
  db=new DatabaseSync(resolve(data,"prototype-catalog.db"));
  let ready;
  await expect.poll(async()=>{ready=await invoke("check_readiness",{browser:"chrome"});return ready.checks.find(c=>c.id==="worker").state;},{timeout:45000,intervals:[500,1000]}).toBe("ready");
  expect(ready.checks.find(c=>c.id==="folder").state).toBe("ready");
  expect(ready.freeBytes).toBeGreaterThan(256*1024*1024);
  expect(ready.checks.find(c=>c.id==="worker").state).toBe("ready");
  expect(ready.checks.find(c=>c.id==="ffmpeg").state).toBe("ready");
  expect(await invoke("check_readiness",{browser:"unknown"}).then(()=>"",error=>String(error))).toContain("supported browser");

  for(const [job,native,caption,kind,path,bytes] of [["job-image","101","Photo fixture","image",img,image.length],["job-video","201","Video fixture","video",vid,video.length]]){
    db.prepare("INSERT INTO download_jobs(id,title,mode,state,destination,created_at,source,account_id,target) VALUES(?,'Media','new_only','completed',?,'2026-10-05T00:00:00Z','instagram','42','target')").run(job,dirname(path));
    const post=db.prepare("INSERT INTO posts(source,account_id,native_id,creator,caption,kind,collection,saved_at,prototype) VALUES('instagram','42',?,'Fixture',?,?,'Media','2026-10-05T00:00:00Z',0)").run(native,caption,kind).lastInsertRowid;
    db.prepare("INSERT INTO media_files(post_id,job_id,path,bytes,file_key) VALUES(?,?,?,?,?)").run(Number(post),job,path,bytes,native);
  }
  // A first-use H.264 check bypasses process startup even while the download engine is busy.
  const fastCheckVideoId=db.prepare("SELECT id FROM media_files WHERE file_key='201'").get().id;
  db.prepare("UPDATE download_jobs SET state='running' WHERE id='job-video'").run();
  const rendererChecks=await page.evaluate(async id=>{
    const times=[];
    for(let n=0;n<10;n++){
      const started=performance.now();
      if(await window.__TAURI_INTERNALS__.invoke("prepare_video",{id,force:false})!==false)throw new Error("Ordinary playback should not convert.");
      times.push(performance.now()-started);
    }
    return {firstMs:times[0],medianMs:[...times].sort((a,b)=>a-b)[5],maxMs:Math.max(...times),allMs:times};
  },fastCheckVideoId);
  const playbackCheckMs=[];
  for(let n=0;n<10;n++){
    const started=performance.now();expect(await invoke("prepare_video",{id:fastCheckVideoId,force:false})).toBe(false);
    playbackCheckMs.push(performance.now()-started);
  }
  db.prepare("UPDATE download_jobs SET state='completed' WHERE id='job-video'").run();
  expect(Math.max(...playbackCheckMs)).toBeLessThan(1000);
  const automationDecision={firstMs:playbackCheckMs[0],medianMs:[...playbackCheckMs].sort((a,b)=>a-b)[5],maxMs:Math.max(...playbackCheckMs)};
  const videoPostId=db.prepare("SELECT post_id FROM media_files WHERE id=?").get(fastCheckVideoId).post_id;
  const listedStarted=performance.now();const listed=await invoke("post_files",{id:videoPostId});const fileListMs=performance.now()-listedStarted;
  expect(listed[0].playback).toBe("original");
  const rendererFileList=await page.evaluate(async id=>{
    const started=performance.now();const files=await window.__TAURI_INTERNALS__.invoke("post_files",{id});
    return {ms:performance.now()-started,playback:files[0].playback};
  },videoPostId);
  expect(rendererFileList.playback).toBe("original");
  await writeFile(resolve(data,"playback-timing.json"),JSON.stringify({rendererChecks,rendererFileList,automationDecision,fileListMs,initialPlayback:"original",checks:10,whileDownloadRunning:true,automationTransportExcludedFromRendererTimings:true},null,2));
  await page.reload();await expect(page.getByTestId("library-list").locator("article")).toHaveCount(2);
  await expect(page.locator(".content-thumbnail img")).toHaveCount(2,{timeout:45000});
  const thumbnailBounds=()=>page.locator(".content-thumbnail img").evaluateAll(images=>images.flatMap(image=>{
    const box=image.getBoundingClientRect(),tile=image.parentElement.getBoundingClientRect(),row=image.closest("article").getBoundingClientRect();
    return box.width>52.5||box.height>56.5||box.left<tile.left-0.5||box.right>tile.right+0.5||box.top<tile.top-0.5||box.bottom>tile.bottom+0.5||box.top<row.top-0.5||box.bottom>row.bottom+0.5?[{width:box.width,height:box.height}]:[];
  }));
  await expect.poll(()=>page.locator(".content-thumbnail img").evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true);
  expect(await page.locator(".content-thumbnail img").evaluateAll(images=>images.some(image=>image.naturalHeight>image.naturalWidth*4))).toBe(true);
  await page.mouse.move(0,0);expect(await thumbnailBounds()).toEqual([]);
  await page.screenshot({path:resolve(data,"portrait-thumbnails.png")});
  await page.getByTestId("library-list").locator("article").first().hover();expect(await thumbnailBounds()).toEqual([]);
  await page.getByRole("button",{name:"Collapse sidebar",exact:true}).click();
  await page.mouse.move(700,180);await expect(page.locator(".sidebar-shell")).toHaveClass(/collapsed/);await page.waitForTimeout(260);
  const collapsedRail=await page.locator(".sidebar-shell").boundingBox(),brandIcon=await page.locator(".sidebar-toggle").boundingBox();
  expect(Math.abs(brandIcon.x+brandIcon.width/2-collapsedRail.x-collapsedRail.width/2)).toBeLessThan(1);
  const sidebarIcon=await page.getByRole("button",{name:"Library",exact:true}).locator("svg").boundingBox();
  for(let repeat=0;repeat<3;repeat++){
    await page.getByRole("button",{name:"Expand sidebar",exact:true}).click();await expect(page.locator(".sidebar-shell")).toHaveClass(/expanded/);await page.waitForTimeout(280);
    expect(await page.locator(".sidebar-scroll .scroll-x").count()).toBe(0);
    const hovered=await page.getByRole("button",{name:"Library",exact:true}).locator("svg").boundingBox();
    expect(Math.abs(hovered.x-sidebarIcon.x)).toBeLessThan(1);expect(Math.abs(hovered.y-sidebarIcon.y)).toBeLessThan(1);
    await page.mouse.move(700,180);await expect(page.locator(".sidebar-shell")).toHaveClass(/expanded/);await page.getByRole("button",{name:"Collapse sidebar",exact:true}).click();await expect(page.locator(".sidebar-shell")).toHaveClass(/collapsed/);await page.waitForTimeout(260);
  }
  await page.locator(".sidebar-toggle").hover();await page.getByRole("button",{name:"Expand sidebar",exact:true}).click();await page.mouse.move(700,180);
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByRole("button",{name:"Check setup",exact:true}).click();
  await expect(page.locator(".readiness-checks")).toContainText("The local download engine started",{timeout:45000});
  await page.screenshot({path:resolve(data,"setup-check.png")});
  await page.getByRole("button",{name:"Library",exact:true}).click();
  const fixturePost=db.prepare("SELECT id FROM posts WHERE native_id='101'").get().id;
  db.prepare("UPDATE posts SET url='https://www.instagram.com.evil.test/p/private/' WHERE id=?").run(fixturePost);
  expect(await invoke("open_source_post",{id:fixturePost}).then(()=>"",error=>String(error))).toContain("no supported original link");
  db.prepare("UPDATE posts SET url='' WHERE id=?").run(fixturePost);

  await expect(page.locator(".content-thumbnail img")).toHaveCount(2,{timeout:45000});
  const open=async caption=>{await page.getByTestId("library-list").locator("article").filter({hasText:caption}).getByRole("button",{name:"View saved files"}).click();};
  await open("Photo fixture");await expect.poll(()=>page.locator(".image-viewport img").evaluate(e=>e.complete&&e.naturalWidth===320)).toBe(true);
  await page.getByRole("button",{name:"Zoom in",exact:true}).click();await expect(page.getByText("150%",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Fit image",exact:true}).click();await page.getByRole("button",{name:"Close",exact:true}).click();
  await page.evaluate(()=>{
    window.__prepareVideoCalls=0;
    const invoke=window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke=(name,args,...rest)=>{if(name==="prepare_video")window.__prepareVideoCalls++;return invoke(name,args,...rest);};
  });
  await open("Video fixture");const player=page.locator("video");await expect.poll(()=>player.evaluate(v=>v.readyState>=1),{timeout:30000}).toBe(true);
  const initialViewerDecisionCalls=await page.evaluate(()=>window.__prepareVideoCalls);expect(initialViewerDecisionCalls).toBe(0);
  const playbackTiming=JSON.parse(await readFile(resolve(data,"playback-timing.json"),"utf8"));
  await writeFile(resolve(data,"playback-timing.json"),JSON.stringify({...playbackTiming,initialViewerDecisionCalls},null,2));

  const baseline=process.argv.includes("--baseline");
  const report={baseline,leftClicks:[],transitions:[]};
  await page.evaluate(()=>{window.__events=[];for(const type of ["pointerdown","pointerup","contextmenu","play","pause"])document.addEventListener(type,e=>window.__events.push({type,tag:e.target.tagName,cls:e.target.className,button:e.button,prevented:e.defaultPrevented}),false);});
  const left=async(label,locator,position)=>{
    await player.evaluate(v=>{v.pause();v.muted=false;});
    await locator.click({button:"left",position});await page.waitForTimeout(180);
    const playing=await player.evaluate(v=>!v.paused);report.leftClicks.push({label,playing});
    if(!baseline)expect(playing,`${label} left-click must play`).toBe(true);
    await locator.click({button:"left",position});await page.waitForTimeout(100);
    if(!baseline)expect(await player.evaluate(v=>v.paused),`${label} second left-click must pause`).toBe(true);
  };
  await left("video",player,{x:100,y:100});
  await left("control-bar background",page.locator(".video-controls"),{x:3,y:3});
  const transition=async(label,action)=>{
    await page.evaluate(()=>{window.__frames=[];const started=performance.now();function sample(){const stage=document.querySelector('.media-stage'),video=stage.querySelector('video'),img=stage.querySelector('img'),target=video??img;const r=target.getBoundingClientRect();window.__frames.push({ms:performance.now()-started,full:!!document.fullscreenElement,rect:{x:r.x,y:r.y,w:r.width,h:r.height},dialog:document.querySelector('.media-dialog').getBoundingClientRect().toJSON(),slot:document.querySelector('.media-stage-slot').getBoundingClientRect().toJSON(),viewport:{width:innerWidth,height:innerHeight},locked:document.querySelector('.media-dialog').hasAttribute('data-fullscreen-shell'),backdropOpacity:Number(getComputedStyle(document.querySelector('.media-dialog'),'::backdrop').opacity),backdropAnimations:document.querySelector('.media-dialog').getAnimations().filter(a=>a.effect?.pseudoElement==='::backdrop').length,animations:target.getAnimations().length,transform:getComputedStyle(target).transform,scroll:document.querySelector('.media-dialog .dialog-scroll>.scroll-viewport').scrollTop});if(performance.now()-started<650)requestAnimationFrame(sample);}requestAnimationFrame(sample);});
    await action();await page.waitForTimeout(700);
    report.transitions.push({label,frames:await page.evaluate(()=>window.__frames)});
  };
  await player.evaluate(v=>v.currentTime=1);
  await transition("video enter",()=>page.getByRole("button",{name:"Enter fullscreen",exact:true}).click());
  await left("fullscreen video",player,{x:200,y:200});
  await left("fullscreen control-bar background",page.locator(".video-controls"),{x:3,y:3});
  await transition("video exit",()=>page.getByRole("button",{name:"Exit fullscreen",exact:true}).click());
  await page.getByRole("button",{name:"Close",exact:true}).click();await open("Photo fixture");
  await expect.poll(()=>page.locator('.image-viewport img').evaluate(i=>i.complete)).toBe(true);
  await transition("image enter",()=>page.getByRole("button",{name:"Fullscreen",exact:true}).click());
  await transition("image Escape exit",()=>page.keyboard.press("Escape"));
  if(!baseline){
    for(const transition of report.transitions){
      expect(transition.frames.filter(f=>f.animations).length,transition.label+" animated frames").toBeGreaterThan(2);
      expect(transition.frames.at(-1).animations,transition.label+" settles").toBe(0);
      expect(new Set(transition.frames.map(f=>f.scroll)).size,transition.label+" preserves scroll").toBe(1);
      expect(new Set(transition.frames.map(f=>f.dialog.height)).size,transition.label+" holds dialog height").toBe(1);
      expect(new Set(transition.frames.map(f=>f.slot.height)).size,transition.label+" holds inline viewer height").toBe(1);
      if(transition.label.includes("exit"))expect(transition.frames.some(f=>f.backdropOpacity>0.74&&f.backdropOpacity<1),transition.label+" fades backdrop").toBe(true);
    }
  }
  if(!baseline){
    await page.getByRole("button",{name:"Close",exact:true}).click();await open("Video fixture");
    await expect.poll(()=>player.evaluate(v=>v.readyState>=1)).toBe(true);
    await player.evaluate(async v=>{window.__originalVideo=v;window.__originalSource=v.src;v.currentTime=0;v.muted=false;await v.play();});
    await transition("playing video enter",()=>page.getByRole("button",{name:"Enter fullscreen",exact:true}).click());
    expect(await player.evaluate(v=>v===window.__originalVideo&&v.src===window.__originalSource&&!v.paused&&v.currentTime>0)).toBe(true);
    await transition("playing video exit",()=>page.getByRole("button",{name:"Exit fullscreen",exact:true}).click());
    expect(await player.evaluate(v=>v===window.__originalVideo&&v.src===window.__originalSource&&!v.paused&&v.currentTime>0)).toBe(true);
    await player.evaluate(v=>v.pause());await player.focus();
    for(let n=0;n<3;n++){
      await page.keyboard.press("f");await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
      await page.keyboard.press("f");await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
    }
    await expect.poll(()=>page.locator('.media-stage').getAttribute('data-fullscreen-motion')).toBe(null);
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.getByRole("button",{name:"Enter fullscreen",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
    expect(await player.evaluate(v=>v.getAnimations().length)).toBe(0);
    await page.keyboard.press("Escape");await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
    report.playbackPreserved=true;report.rapidCycles=3;report.reducedMotion=true;
  }
  if(!baseline){
    await player.evaluate(v=>v.pause());await player.click({button:"right",position:{x:100,y:100}});
    expect(await player.evaluate(v=>v.paused)).toBe(true);
    await expect.poll(()=>page.locator('.media-dialog').getAttribute('data-fullscreen-shell')).toBe(null);
    report.rightClickInert=true;
  }
  report.events=await page.evaluate(()=>window.__events);
  report.errors=errors;
  await writeFile(resolve(data,"transitions.json"),JSON.stringify(report,null,2));
  await page.screenshot({path:resolve(data,"window-restored.png")});
  process.stdout.write(JSON.stringify({data,leftClicks:report.leftClicks,transitions:report.transitions.map(t=>({label:t.label,animatedFrames:t.frames.filter(f=>f.animations).length,scrolls:[...new Set(t.frames.map(f=>f.scroll))]})),errors})+"\n");
}finally{
  db?.close();if(browser)await browser.close();if(app.pid&&app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});
}
