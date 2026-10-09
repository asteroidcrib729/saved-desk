import {configureFixtureTools} from "./fixture-tools.mjs";
// Isolated direct-attachment acceptance: packaged worker and real WebView2 playback.
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { createServer as createPort } from "node:net";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const project=resolve(import.meta.dirname,"../..");
const data=resolve(project,".cache/native-discord-media",randomUUID());await mkdir(data,{recursive:true});
const encoder=await configureFixtureTools(project,data);
const image=resolve(data,"fixture.jpg"),video=resolve(data,"fixture.mov"),audio=resolve(data,"fixture.wav");
for(const args of [
  ["-f","lavfi","-i","testsrc2=s=320x240:r=24:d=2","-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p",video],
  ["-i",video,"-frames:v","1",image],
  ["-f","lavfi","-i","sine=frequency=440:duration=2","-c:a","pcm_s16le",audio],
]) {
  const result=spawnSync(encoder,["-nostdin","-v","error","-n",...args.slice(0,-1),"-threads","1","-filter_threads","1",args.at(-1)],{windowsHide:true,timeout:30000});
  if(result.status!==0)throw new Error("Media fixture encoding failed");
}
const fixtures={"222":await readFile(image),"223":await readFile(video),"224":await readFile(audio)};
const requests=[];let status=200;
const server=createServer((request,response)=>{
  requests.push({path:request.url,cookie:request.headers.cookie,authorization:request.headers.authorization});
  const bytes=fixtures[request.url.split("/").at(-1)];
  if(!bytes){response.writeHead(404);response.end();return;}
  response.writeHead(status,{"Content-Type":"application/octet-stream","Content-Length":status===200?bytes.length:0});
  if(status!==200){response.end();return;}
  let offset=0;const timer=setInterval(()=>{
    if(response.destroyed){clearInterval(timer);return;}
    const next=Math.min(bytes.length,offset+Math.ceil(bytes.length/12));response.write(bytes.subarray(offset,next));offset=next;
    if(offset===bytes.length){clearInterval(timer);response.end();}
  },70);
});await new Promise(done=>server.listen(0,"127.0.0.1",done));
const port=await new Promise(done=>{const finder=createPort();finder.listen(0,"127.0.0.1",()=>{const p=finder.address().port;finder.close(()=>done(p));});});
const env={...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_REQUIRE_PACKAGED_WORKER:"1",SAVEDDESK_TEST_PLATFORM_ORIGIN:`http://127.0.0.1:${server.address().port}`,SAVEDDESK_TEST_PIPE_SUFFIX:randomUUID(),WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`};
const app=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk.exe"),[],{windowsHide:true,env,stdio:["ignore","pipe","pipe"]});
let browser,db,output="";for(const stream of [app.stdout,app.stderr])stream.on("data",b=>output=(output+b.toString()).slice(-4000));
try {
  for(let i=0;i<120;i++){if(app.exitCode!==null)throw new Error(output);try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(done=>setTimeout(done,250));}}
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page=browser.contexts()[0].pages()[0],errors=[];page.on("pageerror",e=>errors.push(e.message));
  const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
  await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible({timeout:30000});
  await invoke("get_snapshot");db=new DatabaseSync(resolve(data,"prototype-catalog.db"),{readOnly:true});db.exec("PRAGMA busy_timeout=2000");
  const downloads=resolve(data,"downloads");await mkdir(downloads,{recursive:true});
  await invoke("save_settings",{settings:{downloadFolder:downloads,lowResource:true,quality:"original",profile:"original"}});
  await page.getByRole("button",{name:"Accounts",exact:true}).click();
  await expect(page.getByText("Ready for media links",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Download Discord media",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Platform",exact:true})).toHaveValue("discord");
  expect(await page.locator('option[value="spotify"]').count()).toBe(0);
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  const target=(id,name,ex="abcdef")=>`https://cdn.discordapp.com/attachments/111/${id}/${encodeURIComponent(name)}?ex=${ex}&is=123abc&hm=abc123`;
  const wait=async id=>{await expect.poll(()=>db.prepare("SELECT state FROM download_jobs WHERE id=?").get(id).state,{timeout:90000}).toMatch(/completed|failed/);return db.prepare("SELECT * FROM download_jobs WHERE id=?").get(id);};
  async function queue(id,name,mode="new_only",ex="abcdef") {
    const draft=await invoke("prepare_download",{request:{source:"discord",target:target(id,name,ex),title:`Discord ${name}`,quality:"original",profile:"original"}});
    const job=await invoke("start_download",{token:draft.token,mode});return {draft,id:job,result:await wait(job)};
  }
  const names={"222":"photo space.jpg","223":"clip.mov","224":"voice.wav"};const jobs={};
  for(const [id,name] of Object.entries(names)) {
    const result=await queue(id,name);expect(result.result.state).toBe("completed");expect(result.result.error).toBe("");expect(result.result.saved).toBe(1);jobs[id]=result.id;
  }
  expect(db.prepare("SELECT count(*) n FROM accounts").get().n).toBe(0);
  expect(requests).toHaveLength(3);expect(requests.every(r=>!r.cookie&&!r.authorization&&r.path.startsWith("/media/"))).toBe(true);
  const paths=db.prepare("SELECT path FROM media_files WHERE job_id IN (?,?,?) ORDER BY job_id").all(...Object.values(jobs));expect(paths).toHaveLength(3);
  const savedVideo=db.prepare("SELECT path,original_path FROM media_files WHERE job_id=?").get(jobs["223"]);
  expect(savedVideo.path).toMatch(/\.mp4$/);expect(savedVideo.original_path).toBe("");expect((await readdir(resolve(savedVideo.path,".."))).some(n=>n.endsWith(".mov"))).toBe(false);
  for(const row of db.prepare("SELECT target FROM download_jobs WHERE source='discord'").all())expect(row.target).not.toContain("hm=");
  for(const row of db.prepare("SELECT url FROM posts WHERE source='discord'").all())expect(row.url).not.toContain("hm=");
  const before=requests.length;const skip=await queue("222",names["222"],"new_only","abcdee");expect(skip.draft.existing).toBeGreaterThan(0);expect(skip.result.skipped).toBe(1);expect(skip.result.saved).toBe(0);expect(requests.length).toBe(before);
  const repeat=await queue("222",names["222"],"all_again");expect(repeat.result.saved).toBe(1);
  const audioPath=db.prepare("SELECT path FROM media_files WHERE job_id=?").get(jobs["224"]).path;await unlink(audioPath);
  const restore=await queue("224",names["224"]);expect(restore.result.saved).toBe(1);
  status=403;const expired=await queue("222",names["222"],"all_again");expect(expired.result.state).toBe("failed");expect(expired.result.error).toContain("fresh media link");expect(db.prepare("SELECT count(*) n FROM media_files WHERE job_id=?").get(expired.id).n).toBe(0);status=200;
  await page.getByRole("button",{name:"Library",exact:true}).click();await page.getByRole("combobox",{name:"Library platform",exact:true}).selectOption("discord");
  await expect(page.getByTestId("library-list").locator("article")).toHaveCount(3,{timeout:15000});
  const playback={};
  for(const [name,selector] of [[names["224"],"audio"],[names["223"],"video"]]) {
    await page.getByTestId("library-list").locator("article").filter({hasText:name}).getByRole("button",{name:"View saved files",exact:true}).click();
    const media=page.locator(`dialog[open] ${selector}`);await expect(media).toBeVisible({timeout:15000});
    await expect.poll(()=>media.evaluate(v=>v.readyState),{timeout:15000}).toBeGreaterThanOrEqual(2);
    await media.evaluate(v=>v.play());await expect.poll(()=>media.evaluate(v=>v.currentTime),{timeout:5000}).toBeGreaterThan(0.2);
    playback[selector]=await media.evaluate(v=>({duration:v.duration,currentTime:v.currentTime,error:v.error?.code??null,...(v.tagName==="VIDEO"?{frames:v.getVideoPlaybackQuality().totalVideoFrames}: {})}));
    expect(playback[selector].error).toBeNull();if(selector==="video")expect(playback.video.frames).toBeGreaterThan(0);
    await page.getByRole("button",{name:"Close",exact:true}).click();
  }
  await page.getByRole("button",{name:"Audio",exact:true}).click();await expect(page.getByTestId("library-list").locator("article")).toHaveCount(1);
  const rejected=await invoke("prepare_download",{request:{source:"spotify",target:"https://open.spotify.com/track/0123456789ABCDEFGHIJKL",title:"",quality:"original",profile:"original"}}).then(()=>false,()=>true);expect(rejected).toBe(true);
  const signedFiles=(await readdir(data)).filter(n=>n.startsWith("attachment-")&&n.endsWith(".dpapi"));expect(signedFiles).toEqual([`attachment-${expired.id}.dpapi`]);
  expect(errors).toEqual([]);await page.screenshot({path:resolve(data,"discord-audio.png")});
  await writeFile(resolve(data,"acceptance.json"),JSON.stringify({passed:true,jobs,playback,transfers:requests.length,connectedAccounts:0,checks:["ready media UI","no Spotify option or native source","real image/audio/MOV transfer","MP4 only final video","native audio/video playback","audio filtering","renewed signature duplicates","repeat copy","missing-file restore","expired link no catalog","no account headers/APIs","signed URL secrecy and completed-job cleanup; failed-job credential remains protected for retry"],errors},null,2));
  console.log(`Native Discord media acceptance passed. Isolated data: ${data}`);
} finally {
  db?.close();if(browser)await browser.close();if(app.pid&&app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});await new Promise(done=>server.close(done));
}
