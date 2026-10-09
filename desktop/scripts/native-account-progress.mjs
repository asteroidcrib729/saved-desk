import {configureFixtureTools} from "./fixture-tools.mjs";
// Isolated authenticated-session/progress/repeat acceptance; all credentials and media are synthetic.
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { createServer as createPort } from "node:net";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const project=resolve(import.meta.dirname,"../..");
const data=resolve(project,".cache/native-account-progress",randomUUID());await mkdir(data,{recursive:true});
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
  else if(request.url==="/video.mp4"||request.url.startsWith("/media/"))setTimeout(()=>{
    const payload=request.url==="/video.mp4"?videoBytes:imageBytes;response.setHeader("Content-Length",payload.length);let offset=0;
    const send=()=>{if(response.destroyed)return;const end=Math.min(payload.length,offset+Math.ceil(payload.length/8));response.write(payload.subarray(offset,end));offset=end;if(offset>=payload.length)response.end();else setTimeout(send,80);};send();
  },delay);
  else {response.writeHead(404);response.end();}
});await new Promise(done=>server.listen(0,"127.0.0.1",done));
const port=await new Promise(done=>{const finder=createPort();finder.listen(0,"127.0.0.1",()=>{const port=finder.address().port;finder.close(()=>done(port));});});
const env={...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_REQUIRE_PACKAGED_WORKER:"1",SAVEDDESK_TEST_PLATFORM_ORIGIN:`http://127.0.0.1:${server.address().port}`,SAVEDDESK_TEST_PIPE_SUFFIX:randomUUID(),WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`};
const app=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk.exe"),[],{windowsHide:true,env,stdio:["ignore","pipe","pipe"]});let browser,db,output="";
for(const stream of [app.stdout,app.stderr])stream.on("data",b=>output=(output+b.toString()).slice(-4000));
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
try{
  for(let i=0;i<120;i++){if(app.exitCode!==null)throw new Error(output);try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(done=>setTimeout(done,250));}}
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];const errors=[];page.on("pageerror",e=>errors.push(e.message));
  const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
  await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible({timeout:30000});
  await invoke("get_snapshot");db=new DatabaseSync(resolve(data,"prototype-catalog.db"),{readOnly:true});
  const downloads=resolve(data,"downloads");await mkdir(downloads,{recursive:true});await invoke("save_settings",{settings:{downloadFolder:downloads,lowResource:true,quality:"original",profile:"original"}});
  const targets={youtube:"https://www.youtube.com/watch?v=BaW_jenozKc",facebook:"https://www.facebook.com/reel/123456789/",tiktok:"https://www.tiktok.com/@fixture_user/photo/123456789",pinterest:"https://www.pinterest.com/example/my-board/",reddit:"https://www.reddit.com/comments/abc123/",discord:"https://cdn.discordapp.com/attachments/111/222/image.jpg?ex=abcdef&is=123abc&hm=abc123"};
  const sessionCookies={youtube:[{name:"SAPISID",value:"synthetic-youtube-secret"}],facebook:[{name:"c_user",value:"42"},{name:"xs",value:"synthetic-facebook-secret"}],tiktok:[{name:"sessionid",value:"synthetic-tiktok-secret"}],pinterest:[{name:"_pinterest_sess",value:"synthetic-pinterest-secret"},{name:"_auth",value:"1"}]};
  async function approve(source,changed=false){
    await invoke("begin_connection",{source,browser:"chrome"});
    const pending=await nativeMessage({protocol_version:1,command:"request"});expect(pending.ok).toBe(true);expect(pending.source).toBe(source);
    const cookies=sessionCookies[source].map((c,index)=>({...c,value:c.value+(changed&&index===0?"-rotated":""),domain:`.${source}.com`,path:"/",secure:true,httpOnly:true}));
    const response=await nativeMessage({protocol_version:1,command:"authorize",source,browser:"chrome",nonce:pending.nonce,cookies,user_agent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"});expect(response.ok).toBe(true);
    await expect.poll(()=>db.prepare("SELECT state FROM accounts WHERE source=?").get(source).state).toBe("session_ready");
    const row=db.prepare("SELECT * FROM accounts WHERE source=?").get(source);expect(row.account_id).toMatch(/^session_[0-9a-f]{64}$/);expect(row.verified_at).toBe(null);
    expect(await nativeMessage({protocol_version:1,command:"connection_status",source,browser:"chrome"})).toMatchObject({ok:true,state:"session_ready"});
    const protectedBytes=await readFile(resolve(data,`session-${source}.dpapi`));expect(protectedBytes.toString()).not.toContain("synthetic-");return row.account_id;
  }
  const wait=async id=>{await expect.poll(()=>db.prepare("SELECT state FROM download_jobs WHERE id=?").get(id).state,{timeout:90000}).toMatch(/completed|failed/);const row=db.prepare("SELECT * FROM download_jobs WHERE id=?").get(id);expect(row.error).toBe("");expect(row.state).toBe("completed");return row;};
  const prepare=source=>invoke("prepare_download",{request:{source,target:targets[source],title:`${source} authenticated test`,quality:"original",profile:"original"}});
  await page.evaluate(async()=>{window.progressEvents=[];await window.__TAURI_INTERNALS__.invoke("plugin:event|listen",{event:"worker-event",target:{kind:"Any"},handler:window.__TAURI_INTERNALS__.transformCallback(event=>{if(event.payload.event==="download_progress")window.progressEvents.push(event.payload);})});});
  // Each new connector is a scoped browser approval, never a fabricated verified identity.
  let youtubeJob;
  for(const source of Object.keys(sessionCookies)){
    const scope=await approve(source);const draft=await prepare(source);const id=await invoke("start_download",{token:draft.token,mode:"new_only"});const job=await wait(id);expect(job.account_id).toBe(scope);expect(job.saved).toBeGreaterThan(0);if(source==="youtube")youtubeJob=id;
  }
  expect(await page.evaluate(()=>window.progressEvents.length)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.progressEvents.some(e=>e.data.received>0 && e.data.total>0))).toBe(true);
  const visible=await page.evaluate(()=>JSON.stringify(window.progressEvents));expect(visible).not.toContain("synthetic-");expect(visible).not.toContain("Cookie");expect(visible).not.toContain("/media/");
  // A draft prepared under another approved credential set cannot start after replacement.
  const stale=await prepare("youtube");await approve("youtube",true);
  expect(await invoke("start_download",{token:stale.token,mode:"new_only"}).then(()=>false,()=>true)).toBe(true);
  await invoke("disconnect_account",{source:"youtube"});expect((await readdir(data)).includes("session-youtube.dpapi")).toBe(false);
  // Anonymous jobs stay anonymous even when optional session approval is available.
  const anonymous=await prepare("youtube");const anonymousJob=await invoke("start_download",{token:anonymous.token,mode:"new_only"});expect((await wait(anonymousJob)).account_id).toBe("public");
  // Real decoder loops the same video instead of advancing or stopping at its end.
  await page.getByRole("combobox",{name:"Library platform",exact:true}).selectOption("youtube");await page.getByRole("button",{name:"View saved files",exact:true}).first().click();
  const video=page.locator("dialog[open] video");await expect(video).toBeVisible();await expect.poll(()=>video.evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
  await page.getByRole("button",{name:"Repeat video",exact:true}).click();await expect.poll(()=>video.evaluate(v=>v.loop)).toBe(true);
  await video.evaluate(async v=>{v.muted=true;v.playbackRate=2;v.currentTime=Math.max(0,v.duration-.1);await v.play();});
  await expect.poll(()=>video.evaluate(v=>!v.ended&&!v.paused&&v.currentTime<v.duration-.15),{timeout:10000}).toBe(true);
  await page.getByRole("button",{name:"Close",exact:true}).click();await page.getByRole("button",{name:"View saved files",exact:true}).first().click();await expect(page.getByRole("button",{name:"Repeat video",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Close",exact:true}).click();
  await page.reload();await page.getByRole("button",{name:"Accounts",exact:true}).click();await expect(page.getByText("Browser session approved",{exact:true})).toHaveCount(3);
  expect(errors).toEqual([]);await page.screenshot({path:resolve(data,"accounts.png")});
  console.log(`Native browser-session/progress/repeat acceptance passed: four approvals through real native messaging and DPAPI, scoped downloads, no verified identity claims, sanitized progress, changed-session draft rejection, disconnect/public fallback and native video looping. Isolated data: ${data}`);

}finally{
  db?.close();if(browser)await browser.close();if(app.pid&&app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});await new Promise(done=>server.close(done));
}
