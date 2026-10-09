import {configureFixtureTools} from "./fixture-tools.mjs";
// Real packaged app/worker with public-only fixtures; never reads owner sessions.
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { createServer as createPort } from "node:net";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const project=resolve(import.meta.dirname,"../..");
const data=resolve(project,".cache/native-platforms",randomUUID());await mkdir(data,{recursive:true});
const encoder=await configureFixtureTools(project,data);
const video=resolve(data,"fixture.mp4");const image=resolve(data,"fixture.jpg");
for(const args of [["-f","lavfi","-i","color=c=0x26c6b1:s=640x360:r=24:d=1","-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-t","1","-c:v","libx264","-preset","veryfast","-c:a","aac","-pix_fmt","yuv420p",video],["-i",video,"-frames:v","1",image]]){
  const result=spawnSync(encoder,["-nostdin","-hide_banner","-loglevel","error","-n",...args.slice(0,-1),"-threads","1","-filter_threads","1",args.at(-1)],{windowsHide:true,timeout:30000});if(result.status!==0)throw new Error("Fixture encoding failed");
}
const videoBytes=await readFile(video),imageBytes=await readFile(image);
const requests=[];let items=[{id:"asset1",post:"123456789",num:1},{id:"asset2",post:"123456789",num:2}];let delay=0;
const server=createServer((request,response)=>{
  requests.push({path:request.url,cookie:request.headers.cookie,authorization:request.headers.authorization});
  if(request.url==="/items")response.end(JSON.stringify(items));
  else if(request.url==="/video.mp4"||request.url.startsWith("/media/"))setTimeout(()=>{if(!response.destroyed)response.end(request.url==="/video.mp4"?videoBytes:imageBytes);},delay);
  else {response.writeHead(404);response.end();}
});await new Promise(done=>server.listen(0,"127.0.0.1",done));
const port=await new Promise(done=>{const finder=createPort();finder.listen(0,"127.0.0.1",()=>{const port=finder.address().port;finder.close(()=>done(port));});});
const env={...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_REQUIRE_PACKAGED_WORKER:"1",SAVEDDESK_TEST_PLATFORM_ORIGIN:`http://127.0.0.1:${server.address().port}`,SAVEDDESK_TEST_PIPE_SUFFIX:randomUUID(),WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`};
const app=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk.exe"),[],{windowsHide:true,env,stdio:["ignore","pipe","pipe"]});let browser,db,output="";
for(const stream of [app.stdout,app.stderr])stream.on("data",b=>output=(output+b.toString()).slice(-4000));
try{
  for(let i=0;i<120;i++){if(app.exitCode!==null)throw new Error(output);try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(done=>setTimeout(done,250));}}
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];const errors=[];page.on("pageerror",e=>errors.push(e.message));
  const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
  await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible({timeout:30000});
  await invoke("get_snapshot");db=new DatabaseSync(resolve(data,"prototype-catalog.db"),{readOnly:true});db.exec("PRAGMA busy_timeout=2000");
  const downloads=resolve(data,"downloads");await mkdir(downloads,{recursive:true});await invoke("save_settings",{settings:{downloadFolder:downloads,lowResource:true,quality:"original",profile:"original"}});
  const targets={youtube:"https://www.youtube.com/watch?v=BaW_jenozKc",facebook:"https://www.facebook.com/reel/123456789/",tiktok:"https://www.tiktok.com/@fixture_user/photo/123456789",pinterest:"https://www.pinterest.com/example/my-board/",discord:"https://cdn.discordapp.com/attachments/111/222/image.jpg?ex=abcdef&is=123abc&hm=abc123"};
  const jobs={};
  const wait=async id=>{await expect.poll(()=>db.prepare("SELECT state FROM download_jobs WHERE id=?").get(id).state,{timeout:90000}).toMatch(/completed|failed/);const result=db.prepare("SELECT * FROM download_jobs WHERE id=?").get(id);expect(result.error).toBe("");expect(result.state).toBe("completed");return result;};
  async function queue(source,mode="new_only",quality="original",profile="original"){
    const draft=await invoke("prepare_download",{request:{source,target:targets[source],title:`${source} integration`,quality,profile}});
    const id=await invoke("start_download",{token:draft.token,mode});return {draft,id,result:await wait(id)};
  }
  for(const source of Object.keys(targets)){
    const {id,result}=await queue(source);jobs[source]=id;expect(result.saved).toBe(["pinterest","tiktok"].includes(source)?2:1);
    const original=db.prepare("SELECT path FROM media_files WHERE job_id=?").all(id);expect(original.length).toBe(result.saved);
    await page.getByRole("combobox",{name:"Library platform",exact:true}).selectOption(source);
    await expect(page.getByTestId("library-list").locator("article").first()).toBeVisible({timeout:10000});
    const item=db.prepare("SELECT id FROM posts WHERE source=? LIMIT 1").get(source);
    const files=await invoke("post_files",{id:item.id});expect(files.every(f=>f.available)).toBe(true);
  }
  expect(db.prepare("SELECT count(*) n FROM accounts").get().n).toBe(0);
  expect(requests.every(r=>!r.cookie&&!r.authorization&&!r.path.startsWith("/viewer/"))).toBe(true);
  expect(db.prepare("SELECT target FROM download_jobs WHERE source='discord'").get().target).not.toContain("hm=");
  expect(db.prepare("SELECT url FROM posts WHERE source='discord'").get().url).not.toContain("hm=");
  expect((await readdir(data)).filter(n=>n.startsWith("attachment-")&&n.endsWith(".dpapi"))).toHaveLength(0);
  const before=requests.filter(r=>r.path.startsWith("/media/")).length;
  const skipped=await queue("pinterest");expect(skipped.draft.existing).toBeGreaterThan(0);expect(skipped.result.saved).toBe(0);expect(skipped.result.skipped).toBe(2);expect(requests.filter(r=>r.path.startsWith("/media/")).length).toBe(before);
  items.push({id:"asset3",post:"987654321",num:1});const incremental=await queue("pinterest");expect(incremental.result.saved).toBe(1);expect(incremental.result.skipped).toBe(2);
  const repeat=await queue("pinterest","all_again");expect(repeat.result.saved).toBe(3);
  const oldPath=db.prepare("SELECT path FROM media_files WHERE job_id=? LIMIT 1").get(jobs.pinterest).path;expect((await readFile(oldPath)).length).toBeGreaterThan(0);
  const removed=db.prepare("SELECT path FROM media_files WHERE job_id=? LIMIT 1").get(repeat.id).path;await unlink(removed);
  // Another committed copy still satisfies duplicate detection; all copies missing triggers restoration.
  const rows=db.prepare("SELECT path FROM media_files WHERE file_key='123456789_1' AND post_id IN (SELECT id FROM posts WHERE source='pinterest')").all();
  for(const row of rows)try{await unlink(row.path);}catch{}
  const restore=await queue("pinterest");expect(restore.result.saved).toBe(1);expect(restore.result.skipped).toBe(2);
  targets.tiktok=targets.tiktok.replace("/photo/","/video/");const tiktokVideo=await queue("tiktok","all_again");expect(tiktokVideo.result.saved).toBe(1);
  const converted=await queue("youtube","all_again","360","compatible_mp4");expect(converted.result.saved).toBe(1);
  const convertedFile=db.prepare("SELECT path FROM media_files WHERE job_id=?").get(converted.id).path;expect(convertedFile).toMatch(/\.mp4$/);expect(db.prepare("SELECT original_path FROM media_files WHERE job_id=?").get(converted.id).original_path).toBe("");
  await page.getByRole("combobox",{name:"Library platform",exact:true}).selectOption("youtube");
  await page.getByRole("button",{name:"View saved files",exact:true}).first().click();await expect(page.locator("dialog[open] video")).toBeVisible({timeout:45000});
  await expect.poll(()=>page.locator("dialog[open] video").evaluate(v=>v.readyState),{timeout:15000}).toBeGreaterThanOrEqual(2);
  await page.getByRole("button",{name:"Close",exact:true}).click();
  await page.getByRole("button",{name:"Settings",exact:true}).click();const readiness=await invoke("check_readiness",{browser:"chrome"});expect(readiness.checks.find(c=>c.id==="youtube").state).toBe("ready");
  const runtime=spawnSync(resolve(project,"desktop/src-tauri/target/debug/worker/_internal/runtime/node.exe"),["--version"],{windowsHide:true});expect(runtime.status).toBe(0);
  const invalid=await invoke("prepare_download",{request:{source:"youtube",target:"https://youtube.com.evil.test/watch?v=BaW_jenozKc",title:"",quality:"original",profile:"original"}}).then(()=>false,()=>true);expect(invalid).toBe(true);
  await page.getByRole("button",{name:"Library",exact:true}).click();await page.screenshot({path:resolve(data,"platforms.png")});expect(errors).toEqual([]);
  console.log(`Native public platform acceptance passed: five sources, zero connected accounts, catalog/media, public isolation, encrypted Discord signatures, skip/incremental/repeat/missing-file restore, video conversion and playback, source filtering, Node/runtime readiness and invalid hosts. Isolated data: ${data}`);
}finally{
  db?.close();if(browser)await browser.close();if(app.pid&&app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});await new Promise(done=>server.close(done));
}
