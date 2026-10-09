import {configureFixtureTools} from "./fixture-tools.mjs";
// Real Instagram adapter + isolated synthetic Firefox consent; never touches owner sessions.
import {chromium,expect} from "@playwright/test";
import {spawn,spawnSync} from "node:child_process";
import {mkdir,readFile,readdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createServer} from "node:http";
import {createServer as createPort} from "node:net";
import {randomUUID,createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
const project=resolve(import.meta.dirname,"../..");
const data=resolve(project,".cache/native-video-reliability",randomUUID());await mkdir(data,{recursive:true});
const encoder=await configureFixtureTools(project,data);
function encode(args){const result=spawnSync(encoder,["-nostdin","-v","error","-n",...args],{windowsHide:true,timeout:30000});if(result.status!==0)throw new Error("QA fixture encoding failed");}
const compatiblePath=resolve(data,"compatible.mp4"),imagePath=resolve(data,"image.jpg");
encode(["-f","lavfi","-i","testsrc2=s=320x240:d=1","-f","lavfi","-i","anullsrc=r=44100:cl=stereo","-t","1","-c:v","libx264","-preset","veryfast","-threads","1","-c:a","aac","-pix_fmt","yuv420p",compatiblePath]);
encode(["-i",compatiblePath,"-frames:v","1","-threads","1",imagePath]);
let brokenColour;
if(process.env.SAVEDDESK_QA_VIDEO_INPUT)brokenColour=await readFile(process.env.SAVEDDESK_QA_VIDEO_INPUT);
else{
 const bad=resolve(data,"reserved.mp4");encode(["-f","lavfi","-i","testsrc2=s=320x240:d=1","-c:v","libvpx-vp9","-deadline","realtime","-cpu-used","8","-threads","1","-movflags","+write_colr",bad]);
 brokenColour=await readFile(bad);const at=brokenColour.indexOf(Buffer.from("nclx"));if(at<0)throw new Error("Colour box missing");Buffer.from([0,0,0,0,0,2]).copy(brokenColour,at+4);
}
const compatible=await readFile(compatiblePath),image=await readFile(imagePath);
const invalid=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from("ftypmp42"),Buffer.alloc(12)]);
const hash=value=>createHash("sha256").update(value).digest("hex");
const firefox=resolve(data,"firefox"),profile=resolve(firefox,"Profiles/test.default");await mkdir(profile,{recursive:true});
await writeFile(resolve(firefox,"profiles.ini"),"[Profile0]\nName=Isolated video QA\nIsRelative=1\nPath=Profiles/test.default\n");
const cookies=new DatabaseSync(resolve(profile,"cookies.sqlite"));cookies.exec("CREATE TABLE moz_cookies(name TEXT,value TEXT,host TEXT,path TEXT,expiry INTEGER,isSecure INTEGER,isHttpOnly INTEGER,originAttributes TEXT)");
cookies.prepare("INSERT INTO moz_cookies VALUES(?,?,?,?,?,?,?,?)").run("sessionid","synthetic-video-qa",".instagram.com","/",4102444800,1,1,"");cookies.close();
const cookieBefore=hash(await readFile(resolve(profile,"cookies.sqlite")));
const items=[{post:"401",id:"401",extension:"mp4"},{post:"402",id:"402",extension:"mp4"},{post:"403",id:"403",extension:"mp4"},{post:"404",id:"404"}];
const requests=[];let repaired=false;
const server=createServer((req,res)=>{
 if(req.url==="/viewer/instagram"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify({user:{pk:42,username:"fixture_user"}}));}
 else if(req.url==="/items")res.end(JSON.stringify(items));
 else if(req.url.startsWith("/media/")){
  requests.push(req.url);const bytes=req.url.endsWith("401")?brokenColour:req.url.endsWith("402")?compatible:req.url.endsWith("403")?(repaired?compatible:invalid):image;
  res.setHeader("Content-Length",bytes.length);res.setHeader("Content-Type",req.url.endsWith("404")?"image/jpeg":"video/mp4");res.end(bytes);
 }else{res.writeHead(404);res.end();}
});await new Promise(done=>server.listen(0,"127.0.0.1",done));
const port=await new Promise(done=>{const s=createPort();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>done(p));});});
const env={...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_TEST_PLATFORM_ORIGIN:`http://127.0.0.1:${server.address().port}`,SAVEDDESK_TEST_FIREFOX_ROOT:firefox,SAVEDDESK_REQUIRE_PACKAGED_WORKER:"1",SAVEDDESK_TEST_PIPE_SUFFIX:randomUUID(),WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`};
const app=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk.exe"),[],{windowsHide:true,env,stdio:"ignore"});let browser,db;
try{
 for(let i=0;i<120;i++){if(app.exitCode!==null)throw new Error("Isolated app exited");try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(done=>setTimeout(done,250));}}
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0],errors=[];page.on("pageerror",e=>errors.push(e.message));
 const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
 await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible({timeout:30000});
 const root=resolve(data,"downloads");await mkdir(root,{recursive:true});await invoke("save_settings",{settings:{downloadFolder:root,lowResource:true,quality:"original",profile:"original"}});
 await page.getByRole("button",{name:"Accounts",exact:true}).click();await page.getByRole("combobox",{name:"Browser",exact:true}).selectOption("firefox");
 await expect(page.getByRole("combobox",{name:"Firefox profile",exact:true})).toContainText("Isolated video QA");
 const account=page.locator(".account-card").filter({has:page.getByRole("heading",{name:"Instagram",exact:true})});
 await account.getByRole("button",{name:"Connect using this browser",exact:true}).click();await expect(account.getByText("Connected as @fixture_user",{exact:true})).toBeVisible({timeout:65000});
 db=new DatabaseSync(resolve(data,"prototype-catalog.db"),{readOnly:true});db.exec("PRAGMA busy_timeout=2000");
 const draft=await invoke("prepare_download",{request:{source:"instagram",target:"",title:"Video reliability QA",quality:"original",profile:"original"}});
 const started=performance.now();const id=await invoke("start_download",{token:draft.token,mode:"new_only"});
 await expect.poll(()=>db.prepare("SELECT state FROM download_jobs WHERE id=?").get(id).state,{timeout:90000}).toBe("failed");
 console.log("Initial mixed collection finished");
 const first=db.prepare("SELECT * FROM download_jobs WHERE id=?").get(id);expect(first.saved).toBe(3);expect(first.failed).toBe(1);expect(requests).toHaveLength(4);
 expect(db.prepare("SELECT state FROM accounts WHERE source='instagram'").get().state).toBe("connected");
 const rows=db.prepare("SELECT m.*,p.native_id FROM media_files m JOIN posts p ON m.post_id=p.id WHERE job_id=?").all(id);
 const converted=rows.find(v=>v.native_id==="401"),unchanged=rows.find(v=>v.native_id==="402");
 expect(hash(await readFile(unchanged.path))).toBe(hash(compatible));expect(hash(await readFile(converted.path))).not.toBe(hash(brokenColour));
 expect(rows.some(v=>v.native_id==="404")).toBe(true);expect(rows.some(v=>v.native_id==="403")).toBe(false);
 const metadata=spawnSync(encoder,["-nostdin","-hide_banner","-i",converted.path],{windowsHide:true,encoding:"utf8",timeout:15000}).stderr;
 const videoLine=metadata.split("\n").find(line=>line.includes("Video:"));expect(videoLine).toContain("h264");expect(videoLine).not.toContain("reserved");
 // Retry keeps completed files, skips their transfers, and saves the remaining item.
 expect((await readdir(first.destination)).some(name=>name.startsWith("403.mp4.rejected-"))).toBe(true);
 repaired=true;
 await invoke("resume_download",{id});await expect.poll(()=>db.prepare("SELECT state FROM download_jobs WHERE id=?").get(id).state,{timeout:90000}).toBe("completed");
 console.log("Unfinished-only retry finished");
 const final=db.prepare("SELECT * FROM download_jobs WHERE id=?").get(id);expect(final.saved).toBe(4);expect(final.failed).toBe(0);expect(requests).toHaveLength(5);
 expect(hash(await readFile(unchanged.path))).toBe(hash(compatible));
 const openTimes=await page.evaluate(async id=>{const out=[];for(let n=0;n<8;n++){const start=performance.now();if(await window.__TAURI_INTERNALS__.invoke("prepare_video",{id,force:false})!==false)throw new Error("Converted MP4 required another conversion");out.push(performance.now()-start);}return out;},converted.id);
 await page.reload();await page.getByRole("combobox",{name:"Library platform",exact:true}).selectOption("instagram");
 const article=page.getByTestId("library-list").locator("article").filter({has:page.locator(`[aria-describedby="post-description-${converted.post_id}"]`)});
 await article.getByRole("button",{name:"View saved files",exact:true}).click();const video=page.locator("dialog[open] video");await expect(video).toBeVisible({timeout:15000});
 await video.evaluate(v=>{v.crossOrigin="anonymous";v.muted=true;v.load();});await expect.poll(()=>video.evaluate(v=>v.readyState),{timeout:15000}).toBeGreaterThanOrEqual(2);await video.evaluate(v=>v.play());
 await expect.poll(()=>video.evaluate(v=>v.currentTime),{timeout:10000}).toBeGreaterThan(0.2);
 const pixels=await video.evaluate(v=>{const canvas=document.createElement("canvas");canvas.width=32;canvas.height=32;const c=canvas.getContext("2d");c.drawImage(v,0,0,32,32);const bytes=c.getImageData(0,0,32,32).data;let min=255,max=0;for(let i=0;i<bytes.length;i++)if(i%4!==3){min=Math.min(min,bytes[i]);max=Math.max(max,bytes[i]);}return {min,max,frames:v.getVideoPlaybackQuality().totalVideoFrames,time:v.currentTime,error:v.error?.code??null};});
 expect(pixels.error).toBeNull();expect(pixels.frames).toBeGreaterThan(0);expect(pixels.max-pixels.min).toBeGreaterThan(20);expect(errors).toEqual([]);
 expect(hash(await readFile(resolve(profile,"cookies.sqlite")))).toBe(cookieBefore);
 await writeFile(resolve(data,"acceptance.json"),JSON.stringify({passed:true,input:process.env.SAVEDDESK_QA_VIDEO_INPUT?"isolated retained failure":"generated reserved-colour fixture",first:{saved:first.saved,failed:first.failed},final:{saved:final.saved,failed:final.failed},requests,pixels,openTimes,seconds:(performance.now()-started)/1000,checks:[process.env.SAVEDDESK_QA_VIDEO_INPUT?"actual retained failed video finalized":"generated reserved-colour video finalized","valid frame colour metadata","real Instagram adapter","compatible file hash unchanged","invalid video does not stop subsequent image","retry automatically fetches fresh bytes for unreadable input and restores only unfinished item","saved files unchanged","converted video plays visible frames","opening converted MP4 does not reconvert","synthetic session source unchanged"],errors},null,2));
 console.log(`Native video reliability acceptance passed. Isolated data: ${data}`);
}catch(error){console.error(error);throw error;}finally{db?.close();if(browser)await browser.close();if(app.pid&&app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});server.closeAllConnections();await new Promise(done=>server.close(done));}
