import {configureFixtureTools} from "./fixture-tools.mjs";
// Packaged native integration with synthetic scoped sessions and loopback media.
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createServer } from "node:http";
import { createServer as createPort } from "node:net";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const project=resolve(import.meta.dirname,"../..");
const data=resolve(project,".cache/native-live",randomUUID());
await mkdir(data,{recursive:true});
const encoder=await configureFixtureTools(project,data);
const fixtureVideo=resolve(data,"fixture-video.mp4");
const encoded=spawnSync(encoder,["-nostdin","-hide_banner","-loglevel","error","-n","-f","lavfi","-i","color=c=0x26c6b1:s=1280x720:r=24:d=2","-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-t","2","-c:v","libx264","-preset","veryfast","-threads","1","-filter_threads","1","-c:a","aac","-pix_fmt","yuv420p",fixtureVideo],{windowsHide:true,timeout:30000});
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
let items=[{post:"100",id:"101"},{post:"100",id:"102"}];
let delay=0;
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
const app=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk.exe"),[],{windowsHide:true,env,stdio:["ignore","pipe","pipe"]});
let output="";
for(const stream of [app.stdout,app.stderr]) stream.on("data",value=>{output=(output+value.toString()).slice(-4000);});
function nativeMessage(value,allowed=true){
  return new Promise((done,reject)=>{
    const child=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk-native-host.exe"),[allowed?"chrome-extension://chjglnciihblkjnhnpinocknamjoecim/":"chrome-extension://unapproved/"],{windowsHide:true,env,stdio:["pipe","pipe","pipe"]});
    let bytes=Buffer.alloc(0);
    child.stdout.on("data",chunk=>{bytes=Buffer.concat([bytes,chunk]);});
    child.on("error",reject);
    child.stdin.on("error",()=>{});
    child.on("exit",()=>{try {if(bytes.length<4){done(null);return;} const size=bytes.readUInt32LE(0);if(size!==bytes.length-4)throw new Error("Invalid native frame.");done(JSON.parse(bytes.subarray(4).toString()));}catch(error){reject(error);}});
    const payload=Buffer.from(JSON.stringify(value));const length=Buffer.alloc(4);length.writeUInt32LE(payload.length);child.stdin.end(Buffer.concat([length,payload]));
  });
}
let browser;
let database;
try {
  for(let attempt=0;attempt<120;attempt++){if(app.exitCode!==null)throw new Error(`Native app exited: ${output}`);try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(done=>setTimeout(done,250));}}
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page=browser.contexts()[0].pages()[0];
  if(!page)throw new Error("Native window did not load.");
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
  await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible();
  database=new DatabaseSync(resolve(data,"prototype-catalog.db"),{readOnly:true});
  const downloads=resolve(data,"downloads");await mkdir(downloads,{recursive:true});
  await invoke("save_settings",{settings:{downloadFolder:downloads,lowResource:true,quality:"original",profile:"original"}});
  await page.reload();
  await page.getByRole("button",{name:"Accounts",exact:true}).click();
  const instagram=page.locator(".account-card").filter({has:page.getByRole("heading",{name:"Instagram",exact:true})});
  await instagram.getByRole("button",{name:"Connect using this browser"}).click();
  await expect(instagram.getByText("Waiting for browser permission")).toBeVisible();
  expect(await nativeMessage({protocol_version:1,command:"request"},false)).toBeNull();
  const pending=await nativeMessage({protocol_version:1,command:"request"});
  if(!pending?.ok)throw new Error(`Native connector request failed: ${pending?.message}`);expect(pending.source).toBe("instagram");
  const approval={protocol_version:1,command:"authorize",nonce:pending.nonce,source:"instagram",browser:"edge",cookies:[{domain:".instagram.com",name:"sessionid",value:"synthetic-secret-native-test",path:"/",secure:true,httpOnly:true}]};
  expect((await nativeMessage({...approval,nonce:"wrong"})).ok).toBe(false);
  expect((await nativeMessage(approval)).ok).toBe(true);
  expect((await nativeMessage(approval)).ok).toBe(false);
  await expect(instagram.getByText("Connected as @fixture_user")).toBeVisible({timeout:65000});
  expect((await page.content()).includes("synthetic-secret-native-test")).toBe(false);
  expect((await readFile(resolve(data,"session-instagram.dpapi"))).includes(Buffer.from("synthetic-secret-native-test"))).toBe(false);
  expect((await readFile(resolve(data,"prototype-catalog.db"))).includes(Buffer.from("synthetic-secret-native-test"))).toBe(false);

  async function add(mode=null){
    await page.getByRole("button",{name:"Add download",exact:true}).click();
    await page.getByRole("button",{name:"Start download",exact:true}).click();
    if(mode)await page.getByRole("button",{name:mode,exact:true}).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button",{name:"Downloads",exact:true}).click();
    await expect.poll(()=>database.prepare("SELECT state FROM download_jobs ORDER BY created_at DESC LIMIT 1").get()?.state,{timeout:65000}).toBe("completed");
  }
  await add();
  expect(media).toHaveLength(2);
  expect(database.prepare("SELECT count(*) AS n FROM posts WHERE prototype=0").get().n).toBe(1);
  expect(database.prepare("SELECT count(*) AS n FROM media_files").get().n).toBe(2);
  await page.getByRole("button",{name:"Library",exact:true}).click();
  await page.getByTestId("library-list").locator("article").first().getByRole("button",{name:"View saved files"}).click();
  await expect(page.getByRole("heading",{name:"Saved files and copies",exact:true})).toBeVisible();
  await expect(page.locator(".saved-files article")).toHaveCount(2);
  await expect(page.locator(".saved-files").getByRole("button",{name:"Open file",exact:true}).first()).toBeEnabled();
  await page.getByRole("button",{name:"Close",exact:true}).click();
  await page.getByRole("button",{name:"Add download",exact:true}).click();
  await page.getByRole("button",{name:"Start download",exact:true}).click();
  await expect(page.getByRole("heading",{name:"You have saved this collection before"})).toBeVisible();
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  expect(media).toHaveLength(2);
  expect(database.prepare("SELECT count(*) AS n FROM download_jobs").get().n).toBe(1);
  await add("Download new items");expect(media).toHaveLength(2);
  const removed=database.prepare("SELECT path FROM media_files WHERE file_key='101'").get().path;
  const normalPath=removed.startsWith("\\\\?\\")?removed.slice(4):removed;
  if(!resolve(normalPath).toLowerCase().startsWith(downloads.toLowerCase()+"\\"))throw new Error("Unexpected fixture output path.");
  await unlink(normalPath);
  await add("Download new items");expect(media).toHaveLength(3);
  items.push({post:"200",id:"201"});
  await add("Download new items");expect(media).toHaveLength(4);
  await add("Download everything again");expect(media).toHaveLength(7);
  expect(database.prepare("SELECT count(*) AS n FROM posts WHERE prototype=0").get().n).toBe(2);

  // Pause while the real engine HTTP downloader is in flight, then resume its saved job.
  items=[{post:"300",id:"301"},{post:"300",id:"302"}];delay=5000;
  const draft=await invoke("prepare_download",{request:{source:"instagram",target:"https://www.instagram.com/p/pause_fixture/",title:"Pause fixture",quality:"original",profile:"original"}});
  const paused=await invoke("start_download",{token:draft.token,mode:"new_only"});
  await page.reload();await page.getByRole("button",{name:"Downloads",exact:true}).click();
  const pauseCard=page.locator(".job-card").filter({has:page.getByRole("heading",{name:"Pause fixture",exact:true})});
  await expect.poll(()=>{
    const current=database.prepare("SELECT state,error FROM download_jobs WHERE id=?").get(paused);
    if(current.state==="failed")throw new Error("Pause fixture failed before transfer: "+current.error);
    return media.length;
  },{timeout:30000}).toBe(8);
  await pauseCard.getByRole("button",{name:"Pause",exact:true}).click();
  await expect.poll(()=>database.prepare("SELECT state FROM download_jobs WHERE id=?").get(paused).state).toBe("paused");
  delay=0;
  await pauseCard.getByRole("button",{name:"Resume",exact:true}).click();
  await expect.poll(()=>database.prepare("SELECT state FROM download_jobs WHERE id=?").get(paused).state,{timeout:65000}).toBe("completed");
  expect(database.prepare("SELECT saved FROM download_jobs WHERE id=?").get(paused).saved).toBe(2);

  // Race the retiring worker deliberately: no UI polling delay between stop/resume.
  delay=5000;
  const racedDraft=await invoke("prepare_download",{request:{source:"instagram",target:"https://www.instagram.com/p/pause_fixture/",title:"Immediate resume fixture",quality:"original",profile:"original"}});
  const previousRequests=media.length;
  const raced=await invoke("start_download",{token:racedDraft.token,mode:"all_again"});
  await expect.poll(()=>media.length,{timeout:30000}).toBeGreaterThan(previousRequests);
  delay=0;
  const immediate=await page.evaluate(async id=>{
    const invoke=window.__TAURI_INTERNALS__.invoke;
    await invoke("stop_download",{id,pause:true});const started=performance.now();
    await invoke("resume_download",{id});return {resumeClicks:1,acknowledgementMs:performance.now()-started};
  },raced);
  await expect.poll(()=>database.prepare("SELECT state FROM download_jobs WHERE id=?").get(raced).state,{timeout:65000}).toBe("completed");
  expect(database.prepare("SELECT saved FROM download_jobs WHERE id=?").get(raced).saved).toBe(2);
  await writeFile(resolve(data,"resume-acceptance.json"),JSON.stringify({passed:true,...immediate,checks:["immediate single resume after pause","no stopping rejection","old generation exits before new transfer","two completed carousel files"]},null,2));

  items=[{post:"400",id:"401",extension:"mp4"}];
  const videoDraft=await invoke("prepare_download",{request:{source:"instagram",target:"https://www.instagram.com/p/video_fixture/",title:"Video fixture",quality:"480",profile:"compatible_mp4"}});
  const videoJob=await invoke("start_download",{token:videoDraft.token,mode:"new_only"});
  await expect.poll(()=>database.prepare("SELECT state FROM download_jobs WHERE id=?").get(videoJob).state,{timeout:65000}).toBe("completed");
  const derived=database.prepare("SELECT path,quality,profile FROM media_files WHERE job_id=?").get(videoJob);
  expect(derived.quality).toBe("480");expect(derived.profile).toBe("compatible_mp4");
  const converted=derived.path.startsWith("\\\\?\\")?derived.path.slice(4):derived.path;
  expect(await readFile(resolve(dirname(converted),"401.mp4"))).not.toEqual(videoBytes);expect(database.prepare("SELECT original_path FROM media_files WHERE job_id=?").get(videoJob).original_path).toBe("");
  const probe=spawnSync(encoder,["-nostdin","-hide_banner","-i",converted],{windowsHide:true,encoding:"utf8",timeout:15000});
  expect(probe.stderr).toContain("854x480");
  const videoPost=database.prepare("SELECT id FROM posts WHERE source='instagram' AND native_id='400'").get().id;
  expect(await invoke("thumbnail",{id:videoPost})).toMatch(/^data:image\/jpeg;base64,/);
  const strictDraft=await invoke("prepare_download",{request:{source:"instagram",target:"https://www.instagram.com/p/strict_fixture/",title:"Strict video fixture",quality:"480",profile:"original"}});
  const strictJob=await invoke("start_download",{token:strictDraft.token,mode:"new_only"});
  await expect.poll(()=>database.prepare("SELECT state FROM download_jobs WHERE id=?").get(strictJob).state,{timeout:65000}).toBe("failed");
  expect(database.prepare("SELECT error FROM download_jobs WHERE id=?").get(strictJob).error).toContain("Choose MP4 with resize fallback");
  expect(database.prepare("SELECT failed FROM download_jobs WHERE id=?").get(strictJob).failed).toBe(1);
  expect(database.prepare("SELECT state FROM accounts WHERE source='instagram'").get().state).toBe("connected");

  // X follows the same private connection/verification boundary with its own stable identity.
  const completeText="A long saved post. ".repeat(300)+"Complete ending.";
  items=[{post:"300",id:"301"},{post:"300",id:"302"},{post:"500",id:"500",extension:"txt",content:completeText}];
  await invoke("begin_connection",{source:"x",browser:"edge"});
  const xPending=await nativeMessage({protocol_version:1,command:"request"});
  const xApproval=await nativeMessage({protocol_version:1,command:"authorize",nonce:xPending.nonce,source:"x",browser:"edge",cookies:["auth_token","ct0"].map(name=>({domain:".x.com",name,value:"synthetic-x-secret",path:"/",secure:true,httpOnly:true}))});
  expect(xApproval?.ok, xApproval?.message ?? "No synthetic X approval response").toBe(true);
  await expect.poll(()=>database.prepare("SELECT state FROM accounts WHERE source='x'").get().state,{timeout:65000}).toBe("connected");
  const xDraft=await invoke("prepare_download",{request:{source:"x",target:"",title:"X fixture",quality:"original",profile:"original"}});
  const xJob=await invoke("start_download",{token:xDraft.token,mode:"new_only"});
  await expect.poll(()=>database.prepare("SELECT state FROM download_jobs WHERE id=?").get(xJob).state,{timeout:65000}).toBe("completed");
  expect(database.prepare("SELECT count(*) AS n FROM posts WHERE source='x' AND account_id='73'").get().n).toBe(2);
  const text=database.prepare("SELECT m.path FROM media_files m JOIN posts p ON p.id=m.post_id WHERE p.source='x' AND p.kind='text'").get().path;
  expect(await readFile(text.startsWith("\\\\?\\")?text.slice(4):text,"utf8")).toContain("https://x.com/fixture_user/status/500");
  expect(await readFile(text.startsWith("\\\\?\\")?text.slice(4):text,"utf8")).toContain(completeText);
  await page.getByRole("button",{name:"Accounts",exact:true}).click();
  await instagram.getByRole("button",{name:"Disconnect",exact:true}).click();
  await expect.poll(()=>database.prepare("SELECT state FROM accounts WHERE source='instagram'").get().state).toBe("not_connected");
  await expect.poll(async()=>{try{await readFile(resolve(data,"session-instagram.dpapi"));return true;}catch{return false;}}).toBe(false);
  await page.getByRole("button",{name:"Accounts",exact:true}).click();
  await page.getByRole("combobox",{name:"Browser",exact:true}).selectOption("firefox");
  await expect(page.getByRole("combobox",{name:"Firefox profile",exact:true})).toContainText("Isolated integration profile");
  await instagram.getByRole("button",{name:"Connect using this browser"}).click();
  await expect(instagram.getByText("Connected as @fixture_user")).toBeVisible({timeout:65000});
  expect(await readFile(resolve(profileDirectory,"cookies.sqlite"))).toEqual(profileBefore);
  expect((await page.content()).includes("synthetic-firefox-secret")).toBe(false);
  expect((await page.content()).includes("unrelated-site-secret")).toBe(false);
  await page.reload();
  await expect(page.getByTestId("library-list").locator("article")).toHaveCount(6);
  expect(errors).toEqual([]);
  await page.screenshot({path:resolve(project,".cache/saveddesk-live-native.png")});
  process.stdout.write(`Native live integration passed: private host, verification, DPAPI, carousel catalog, file details, skip/repeat, repair, incremental, UI pause/resume, video conversion/preview, X text/isolation, disconnect, direct Firefox, reload. Isolated data: ${data}\n`);
}catch(error){
  if(database)await writeFile(resolve(data,"failure-state.json"),JSON.stringify({mediaRequests:media.length,jobs:database.prepare("SELECT title,state,saved,failed,error FROM download_jobs").all()},null,2));
  throw error;
}finally{
  database?.close();if(browser)await browser.close();
  if(app.pid&&app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});
  await new Promise(done=>server.close(done));
}
