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
const data=resolve(project,".cache/native-media",randomUUID());await mkdir(data,{recursive:true});
const old=resolve(data,"selected");await mkdir(old,{recursive:true});
const encoder=await configureFixtureTools(project,data);
const img=resolve(old,"instagram/downloads/job-image/101.jpg");
const vid=resolve(old,"instagram/downloads/job-video/201.mp4");
for(const file of [img,vid])await mkdir(dirname(file),{recursive:true});
function encode(args){const result=spawnSync(encoder,["-nostdin","-hide_banner","-loglevel","error",...args],{windowsHide:true,encoding:"utf8",timeout:60000});if(result.status!==0)throw new Error("Media fixture generation failed: "+result.stderr);}
encode(["-f","lavfi","-i","color=c=teal:s=320x1600","-frames:v","1","-threads","1",img]);
encode(["-f","lavfi","-i","testsrc=size=640x360:rate=15","-vf","noise=alls=50:allf=t","-t","4","-c:v","libx264","-pix_fmt","yuv420p","-preset","ultrafast","-crf","10","-threads","1","-movflags","+faststart",vid]);
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
  // Left-click is the surface action; a right-click only suppresses the browser menu.
  await player.evaluate(v=>{v.muted=true;window.__videoContextPrevented=false;window.addEventListener("contextmenu",event=>{if(event.target===v)window.__videoContextPrevented=event.defaultPrevented;});});
  await player.click({button:"left",position:{x:100,y:100}});
  await expect.poll(()=>player.evaluate(v=>!v.paused)).toBe(true);
  await player.click({button:"left",position:{x:100,y:100}});
  await expect.poll(()=>player.evaluate(v=>v.paused)).toBe(true);
  await player.click({button:"right",position:{x:100,y:100}});
  expect(await page.evaluate(()=>window.__videoContextPrevented)).toBe(true);
  expect(await player.evaluate(v=>v.paused)).toBe(true);
  await player.focus();await page.keyboard.press("Space");
  await expect.poll(()=>player.evaluate(v=>!v.paused)).toBe(true);
  expect(await player.evaluate(v=>getComputedStyle(v).outlineStyle)).toBe("none");
  await page.keyboard.down("Space");await expect.poll(()=>player.evaluate(v=>v.paused)).toBe(true);
  await page.keyboard.down("Space");expect(await player.evaluate(v=>v.paused)).toBe(true);await page.keyboard.up("Space");
  // Deliberate Tab navigation keeps keyboard focus without a playback border.
  await page.keyboard.press("Tab");await page.keyboard.press("Shift+Tab");await expect(player).toBeFocused();
  expect(await player.evaluate(v=>getComputedStyle(v).outlineStyle)).toBe("none");
  await page.keyboard.press("Space");await expect.poll(()=>player.evaluate(v=>!v.paused)).toBe(true);
  expect(await player.evaluate(v=>getComputedStyle(v).outlineStyle)).toBe("none");
  await page.keyboard.press("Space");await expect.poll(()=>player.evaluate(v=>v.paused)).toBe(true);
  await player.evaluate(v=>{v.muted=false;});
  await page.keyboard.press("m");expect(await player.evaluate(v=>v.muted)).toBe(true);
  await page.keyboard.press("k");await expect.poll(()=>player.evaluate(v=>!v.paused)).toBe(true);
  await page.keyboard.press("k");await expect.poll(()=>player.evaluate(v=>v.paused)).toBe(true);
  await player.evaluate(async v=>{v.muted=true;await v.play();});await expect.poll(()=>player.evaluate(v=>!v.paused)).toBe(true);
  await player.evaluate(v=>{v.pause();v.currentTime=3.3;});await expect.poll(()=>player.evaluate(v=>Math.abs(v.currentTime-3.3)<0.2&&!v.seeking),{timeout:30000}).toBe(true);
  const videoId=db.prepare("SELECT id FROM media_files WHERE file_key='201'").get().id;
  const fetchRange=async(header)=>page.evaluate(async({id,header})=>{const r=await fetch(`http://savedmedia.localhost/${id}`,{headers:{Range:header}});return {status:r.status,range:r.headers.get("Content-Range"),bytes:(await r.arrayBuffer()).byteLength};},{id:videoId,header});
  const range=await fetchRange("bytes=0-");expect(range.status).toBe(206);expect(range.bytes).toBe(2*1024*1024);expect(range.range).toBe(`bytes 0-${range.bytes-1}/${video.length}`);
  const tail=await fetchRange("bytes=-512");expect(tail.bytes).toBe(512);expect(tail.status).toBe(206);
  await page.getByRole("button",{name:"Close",exact:true}).click();await page.waitForTimeout(250);
  // Exercise a mixed image/video post with the real scoped media protocol.
  // Temporarily reassign this owned fixture asset, then restore its post identity.
  const originalVideoPost=db.prepare("SELECT post_id FROM media_files WHERE id=?").get(videoId).post_id;
  db.prepare("UPDATE media_files SET post_id=? WHERE id=?").run(fixturePost,videoId);
  await open("Photo fixture");await expect(page.locator(".saved-files article")).toHaveCount(2);
  await page.locator(".saved-files article").filter({hasText:"101.jpg"}).getByRole("button",{name:"View file",exact:true}).click();
  await expect.poll(()=>page.locator(".image-viewport img").evaluate(e=>e.complete&&e.naturalWidth===320)).toBe(true);
  const fullscreen=()=>page.evaluate(()=>document.fullscreenElement?.className??null);
  const fullControls=page.getByRole("group",{name:"Fullscreen viewer controls"});
  await page.getByRole("button",{name:"Fullscreen",exact:true}).click();
  await expect.poll(fullscreen).toBe("media-stage");await expect(fullControls).toBeVisible();
  await expect(fullControls.getByRole("button",{name:"Next",exact:true})).toBeDisabled();
  await fullControls.getByRole("button",{name:"Previous",exact:true}).click();
  await expect.poll(()=>page.locator("video").evaluate(v=>v.readyState>=1),{timeout:30000}).toBe(true);
  expect(await fullscreen()).toBe("media-stage");
  await expect(page.getByRole("button",{name:"Exit fullscreen",exact:true})).toBeVisible();
  await expect(fullControls.getByRole("button",{name:"Close fullscreen"})).toHaveCount(0);
  for(let n=0;n<16;n++){await page.keyboard.press(n%3===0?"Shift+Tab":"Tab");expect(await page.evaluate(()=>document.fullscreenElement.contains(document.activeElement))).toBe(true);}

  // Controls overlay the full video frame, stay in one row and hide while paused or playing.
  const toolbar=page.locator(".video-controls"),fullVideo=page.locator("video");
  await expect(page.locator(".fullscreen-counter")).toHaveCount(0);
  await fullVideo.evaluate(v=>{v.pause();v.muted=true;v.currentTime=0;});
  await fullVideo.click({button:"left",position:{x:100,y:100}});await expect.poll(()=>fullVideo.evaluate(v=>!v.paused)).toBe(true);
  await fullVideo.click({button:"left",position:{x:100,y:100}});await expect.poll(()=>fullVideo.evaluate(v=>v.paused)).toBe(true);
  await fullVideo.focus();await page.keyboard.press("Space");await expect.poll(()=>fullVideo.evaluate(v=>!v.paused)).toBe(true);
  expect(await fullVideo.evaluate(v=>getComputedStyle(v).outlineStyle)).toBe("none");
  await page.keyboard.press("Space");await expect.poll(()=>fullVideo.evaluate(v=>v.paused)).toBe(true);
  const fullGeometry=()=>fullVideo.evaluate(v=>{const frame=v.closest(".media-stage").getBoundingClientRect(),box=v.getBoundingClientRect();return [Math.abs(frame.width-box.width),Math.abs(frame.height-box.height)];});
  if(!(await fullGeometry()).every(delta=>delta<1)){
    const geometry=await fullVideo.evaluate(v=>[v.closest(".media-stage"),v.closest(".media-surface"),v.closest(".video-player"),v].map(e=>({name:e.className,box:e.getBoundingClientRect().toJSON(),height:getComputedStyle(e).height,maxHeight:getComputedStyle(e).maxHeight,position:getComputedStyle(e).position})));
    process.stdout.write(JSON.stringify(geometry)+"\n");await page.screenshot({path:resolve(data,"fullscreen-layout-failure.png")});
  }
  expect((await fullGeometry()).every(delta=>delta<1)).toBe(true);
  const overlay=await toolbar.evaluate(bar=>{const boxes=[...bar.children].map(e=>e.getBoundingClientRect());return {centers:boxes.map(b=>b.y+b.height/2),background:getComputedStyle(bar).backgroundColor,overflow:bar.scrollWidth>bar.clientWidth};});
  expect(Math.max(...overlay.centers)-Math.min(...overlay.centers)).toBeLessThan(2);
  expect(overlay.background).toBe("rgba(8, 10, 13, 0.7)");expect(overlay.overflow).toBe(false);
  await fullVideo.evaluate(v=>{v.pause();v.focus();});
  await page.mouse.move(200,200);await page.mouse.move(210,210);
  await page.waitForTimeout(2600);await expect(toolbar).toBeVisible();
  await expect(toolbar).toBeHidden({timeout:1200});
  expect((await fullGeometry()).every(delta=>delta<1)).toBe(true);
  await page.screenshot({path:resolve(data,"fullscreen-paused-controls-hidden.png")});
  // Tab reveals controls before focus navigation, and focused keyboard controls stay usable.
  await page.keyboard.press("Tab");await expect(toolbar).toBeVisible();
  expect(await toolbar.evaluate(bar=>bar.contains(document.activeElement))).toBe(true);
  await page.waitForTimeout(3300);await expect(toolbar).toBeVisible();
  await page.mouse.move(220,220);await fullVideo.evaluate(async v=>{v.currentTime=0;v.playbackRate=.5;v.muted=true;await v.play();});
  await page.waitForTimeout(2600);await expect(toolbar).toBeVisible();
  await expect(toolbar).toBeHidden({timeout:1200});
  expect(await fullVideo.evaluate(v=>v.paused)).toBe(false);
  await page.screenshot({path:resolve(data,"fullscreen-playing-controls-hidden.png")});
  // Mouse movement anywhere in the frame restores the overlay without shrinking the video.
  await page.mouse.move(230,230);await expect(toolbar).toBeVisible();
  expect((await fullGeometry()).every(delta=>delta<1)).toBe(true);
  await fullVideo.evaluate(v=>{v.pause();v.playbackRate=1;v.currentTime=0;});

  const videoEdges=await fullControls.evaluate(e=>{const p=e.querySelector('[aria-label="Previous"]').getBoundingClientRect(),n=e.querySelector('[aria-label="Next"]').getBoundingClientRect();return {p:p.left,n:n.right,w:innerWidth,y:p.y+p.height/2,h:innerHeight};});
  expect(videoEdges.p).toBeLessThan(24);expect(videoEdges.n).toBeGreaterThan(videoEdges.w-24);expect(Math.abs(videoEdges.y-videoEdges.h/2)).toBeLessThan(2);
  await expect(fullControls.getByRole("button",{name:"Previous",exact:true})).toBeDisabled();
  const oldPlayer=await page.locator("video").elementHandle();
  await oldPlayer.evaluate(async v=>{v.muted=true;await v.play();});
  await expect.poll(()=>oldPlayer.evaluate(v=>!v.paused)).toBe(true);
  await page.screenshot({path:resolve(data,"fullscreen-video-carousel.png")});
  await fullControls.getByRole("button",{name:"Next",exact:true}).click();
  await expect.poll(()=>page.locator(".image-viewport img").evaluate(e=>e.complete&&e.naturalWidth===320)).toBe(true);
  await expect.poll(()=>oldPlayer.evaluate(v=>v.paused)).toBe(true);
  expect(await fullscreen()).toBe("media-stage");
  await expect(page.locator(".fullscreen-counter")).toHaveCount(0);
  await page.screenshot({path:resolve(data,"fullscreen-image-carousel.png")});
  await fullControls.getByRole("button",{name:"Close fullscreen",exact:true}).click();
  await expect.poll(fullscreen).toBe(null);await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(page.getByRole("button",{name:"Fullscreen",exact:true})).toBeFocused();
  await page.getByRole("button",{name:"Fullscreen",exact:true}).click();
  await expect.poll(fullscreen).toBe("media-stage");await page.keyboard.press("Escape");
  await expect.poll(fullscreen).toBe(null);await expect(page.locator("dialog[open]")).toHaveCount(1);
  await page.getByRole("button",{name:"Close",exact:true}).click();
  // Exercise the actual in-player seeking-bar entry/exit, preserving the frame.
  await open("Photo fixture");await page.locator(".saved-files article").filter({hasText:"201.mp4"}).getByRole("button",{name:"View video",exact:true}).click();
  const nativeVideo=page.locator("video");await expect.poll(()=>nativeVideo.evaluate(v=>v.readyState>=1),{timeout:30000}).toBe(true);
  await page.getByRole("combobox",{name:"Playback speed"}).selectOption("1.5");expect(await nativeVideo.evaluate(v=>v.playbackRate)).toBe(1.5);
  await page.getByRole("slider",{name:"Video volume"}).press("Home");await page.getByRole("slider",{name:"Video volume"}).press("ArrowRight");expect(await nativeVideo.evaluate(v=>Math.round(v.volume*100))).toBe(1);
  await page.getByRole("slider",{name:"Video position"}).press("End");await expect.poll(()=>nativeVideo.evaluate(v=>v.currentTime)).toBeGreaterThan(3.8);
  await page.getByRole("button",{name:"Back 10 seconds"}).click();await expect.poll(()=>nativeVideo.evaluate(v=>v.currentTime)).toBe(0);
  await page.getByRole("button",{name:"Play video",exact:true}).click();await expect.poll(()=>nativeVideo.evaluate(v=>!v.paused)).toBe(true);
  await page.getByRole("button",{name:"Pause video",exact:true}).click();await expect.poll(()=>nativeVideo.evaluate(v=>v.paused)).toBe(true);
  const playerAudit=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22a","wcag22aa"]).analyze();
  await writeFile(resolve(data,"video-accessibility-audit.json"),JSON.stringify({violations:playerAudit.violations,incomplete:playerAudit.incomplete},null,2));expect(playerAudit.violations).toEqual([]);
  await page.getByRole("button",{name:"Enter fullscreen",exact:true}).click();await expect.poll(fullscreen).toBe("media-stage");
  await expect(fullControls.getByRole("button",{name:"Close fullscreen"})).toHaveCount(0);
  await fullControls.getByRole("button",{name:"Next",exact:true}).click();await expect.poll(()=>page.locator(".image-viewport img").evaluate(e=>e.complete&&e.naturalWidth===320)).toBe(true);
  await fullControls.getByRole("button",{name:"Close fullscreen",exact:true}).click();await expect.poll(fullscreen).toBe(null);
  await page.locator(".saved-files article").filter({hasText:"201.mp4"}).getByRole("button",{name:"View video",exact:true}).click();await expect.poll(()=>nativeVideo.evaluate(v=>v.readyState>=1)).toBe(true);
  await page.getByRole("button",{name:"Enter fullscreen",exact:true}).click();await expect.poll(fullscreen).toBe("media-stage");
  await page.getByRole("button",{name:"Exit fullscreen",exact:true}).click();await expect.poll(fullscreen).toBe(null);await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(page.getByRole("button",{name:"Enter fullscreen",exact:true})).toBeFocused();
  await page.getByRole("button",{name:"Close",exact:true}).click();
  db.prepare("UPDATE media_files SET post_id=? WHERE id=?").run(originalVideoPost,videoId);
  // Remove only the two known fixture preview files; never delete a directory tree.
  await unlink(resolve(dirname(img),".previews/101.jpg.jpg"));await unlink(resolve(dirname(vid),".previews/201.mp4.jpg"));
  const moved=resolve(data,"moved");await rename(old,moved);
  await invoke("save_settings",{settings:{...settings,downloadFolder:moved}});
  expect(db.prepare("SELECT count(*) AS n FROM media_files WHERE path LIKE ?").get("%\\moved\\%").n).toBe(2);
  await page.reload();await expect(page.locator(".content-thumbnail img")).toHaveCount(2,{timeout:45000});
  const repair=await invoke("repair_library");expect(repair.available).toBe(2);expect(repair.relinked).toBe(0);
  await open("Photo fixture");await expect.poll(()=>page.locator(".image-viewport img").evaluate(e=>e.complete&&e.naturalWidth===320)).toBe(true);await page.getByRole("button",{name:"Close",exact:true}).click();
  // A catalog row outside the selected tree remains inaccessible, even if it
  // points to a valid matching image. No foreign filesystem contents are read.
  const outside=resolve(data,"outside.jpg");await writeFile(outside,image);
  const imageId=db.prepare("SELECT id FROM media_files WHERE file_key='101'").get().id;
  const relocated=db.prepare("SELECT path FROM media_files WHERE id=?").get(imageId).path;
  db.prepare("UPDATE media_files SET path=? WHERE id=?").run(outside,imageId);
  expect((await invoke("post_files",{id:db.prepare("SELECT post_id FROM media_files WHERE id=?").get(imageId).post_id}))[0].available).toBe(false);
  expect(await invoke("open_media_file",{id:imageId}).then(()=>"",error=>String(error))).toContain("selected save folder");
  expect(await invoke("open_item",{id:db.prepare("SELECT post_id FROM media_files WHERE id=?").get(imageId).post_id}).then(()=>"",error=>String(error))).toContain("selected save folder");
  const forbidden=await page.evaluate(async id=>{try{return (await fetch(`http://savedmedia.localhost/${id}`)).status;}catch{return 404;}},imageId);expect(forbidden).toBe(404);
  // Check a Windows junction pointing outside the selected folder as well.
  const foreign=resolve(data,"foreign");await mkdir(foreign,{recursive:true});await writeFile(resolve(foreign,"101.jpg"),image);
  const junction=resolve(moved,"outside-link");
  const quote=value=>"'"+value.replaceAll("'","''")+"'";
  const linked=spawnSync("powershell.exe",["-NoProfile","-Command",`New-Item -ItemType Junction -Path ${quote(junction)} -Target ${quote(foreign)} | Out-Null`],{windowsHide:true,encoding:"utf8"});
  if(linked.status!==0)throw new Error("Junction fixture could not be created.");
  db.prepare("UPDATE media_files SET path=? WHERE id=?").run(resolve(junction,"101.jpg"),imageId);
  expect((await invoke("post_files",{id:db.prepare("SELECT post_id FROM media_files WHERE id=?").get(imageId).post_id}))[0].available).toBe(false);
  expect(await invoke("open_media_file",{id:imageId}).then(()=>"",error=>String(error))).toContain("selected save folder");
  db.prepare("UPDATE media_files SET path=? WHERE id=?").run(relocated,imageId);
  // An unavailable selected drive must not fall back to files in another folder.
  db.prepare("UPDATE settings SET value=?").run(JSON.stringify({...settings,downloadFolder:resolve(data,"disconnected-drive")}));
  const offline=await invoke("check_readiness",{browser:"chrome"});
  expect(offline.checks.find(c=>c.id==="folder").state).toBe("blocked");expect(offline.freeBytes).toBe(null);
  const jobsBefore=db.prepare("SELECT count(*) AS n FROM download_jobs").get().n;
  expect(await invoke("prepare_download",{request:{source:"instagram",target:"",title:"",quality:"original",profile:"original"}}).then(()=>"",error=>String(error))).toContain("selected save folder is unavailable");
  const sample=await invoke("prepare_prototype");
  expect(await invoke("run_prototype",{token:sample.token,mode:"new_only"}).then(()=>"",error=>String(error))).toContain("selected save folder is unavailable");
  expect(db.prepare("SELECT count(*) AS n FROM download_jobs").get().n).toBe(jobsBefore);
  expect(await stat(resolve(data,"disconnected-drive")).then(()=>true,()=>false)).toBe(false);

  expect((await invoke("post_files",{id:db.prepare("SELECT post_id FROM media_files WHERE id=?").get(imageId).post_id}))[0].available).toBe(false);
  db.prepare("UPDATE settings SET value=?").run(JSON.stringify({...settings,downloadFolder:moved}));
  // Real Windows UI regression: a populated catalog and changing job progress
  // must not reset the scroll position. These records live only in this fixture.
  const insert=db.prepare("INSERT INTO posts(source,account_id,native_id,creator,caption,kind,collection,saved_at,prototype) VALUES('instagram','42',?,'UI fixture',?,'text',?,'2026-10-05T00:00:00Z',0)");
  db.exec("BEGIN");
  for(let index=0;index<100;index++) insert.run(`ui-${index}`,`UI scroll item ${index}`,"A long collection name ".repeat(10));
  db.prepare("INSERT INTO download_jobs(id,title,mode,state,saved,destination,created_at) VALUES('ui-progress','UI progress','new_only','running',0,?,'2026-10-05T00:00:01Z')").run(moved);
  db.exec("COMMIT");
  await page.reload();const list=page.getByTestId("library-list");
  await expect(list.locator("article")).toHaveCount(18);
  await list.evaluate(element=>{element.scrollTop=1408;});
  await expect.poll(()=>list.evaluate(element=>element.scrollTop)).toBe(1408);
  db.prepare("UPDATE download_jobs SET saved=1 WHERE id='ui-progress'").run();
  await page.waitForTimeout(2400);
  expect(await list.evaluate(element=>element.scrollTop)).toBe(1408);
  expect(await list.locator("article").count()).toBeLessThanOrEqual(18);
  db.prepare("UPDATE download_jobs SET state='completed' WHERE id='ui-progress'").run();
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  expect(await page.locator("main").evaluate(element=>element.scrollTop)).toBe(0);
  await page.getByRole("button",{name:"Library",exact:true}).click();
  await page.getByRole("textbox",{name:"Search your library"}).fill("UI scroll item 99");
  await expect(list.locator("article")).toHaveCount(1);
  await page.getByRole("textbox",{name:"Search your library"}).fill("");
  await expect(list.locator("article")).toHaveCount(18);

  // Exercise real WebView2 zoom and persistence in the isolated app profile.
  const normalWidth=await page.evaluate(()=>innerWidth);
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByLabel("Interface size",{exact:true}).selectOption("2");
  await expect.poll(()=>page.evaluate(()=>innerWidth)).toBeLessThan(normalWidth*.6);
  expect(await page.locator("main").evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.getByRole("button",{name:"Help & shortcuts",exact:true}).click();await expect(page.getByRole("button",{name:"Close help"})).toBeFocused();
  await page.keyboard.press("Escape");await page.keyboard.press("Control+0");await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(normalWidth);
  await page.getByLabel("Interface size",{exact:true}).selectOption("1.5");
  await expect.poll(()=>page.evaluate(()=>innerWidth)).toBeLessThan(normalWidth*.8);
  await page.reload();await expect.poll(()=>page.evaluate(()=>innerWidth)).toBeLessThan(normalWidth*.8);
  await page.keyboard.press("Control+0");await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(normalWidth);
  await page.getByRole("button",{name:"Library",exact:true}).click();await expect(list.locator("article").first()).toBeVisible();
  await list.getByRole("button",{name:"View saved files"}).first().focus();await page.keyboard.press("End");
  await expect(list.locator('button[data-index="99"]')).toBeFocused();expect(await list.locator("article").count()).toBeLessThanOrEqual(18);
  await page.keyboard.press("Home");await expect(list.locator('button[data-index="0"]')).toBeFocused();
  expect(errors).toEqual([]);
  await page.screenshot({path:resolve(data,"media-acceptance.png")});
  process.stdout.write("Packaged media acceptance passed: setup/worker/tool checks, offline-folder transfer rejection, unsafe-source-link rejection, video keyboard controls, left-click playback and inert right-click with suppressed browser context menu, Space playback without a border and repeat protection, retained Tab focus cues, portrait thumbnail bounds before/after hover, screen-edge mixed-post navigation/image exit, fullscreen filename-tag removal, full-frame video with a translucent single-row overlay, three-second paused/playing idle hiding and mouse reveal, keyboard focus retention, in-player video fullscreen/exit, accessible playback-speed/volume/seek controls, 100-200% interface zoom/persistence, complete-page keyboard browsing, JPEG display/zoom, multi-chunk MP4 playback/seek, ranges, folder relocation, regenerated previews, blocked outside files, unavailable-drive isolation, populated Windows scrolling/search.\n");
}finally{
  db?.close();if(browser)await browser.close();if(app.pid&&app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});
}
