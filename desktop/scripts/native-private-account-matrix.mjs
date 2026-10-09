import {configureFixtureTools,stageFixtureApp} from "./fixture-tools.mjs";
// Isolated authenticated-session/progress/repeat acceptance; all credentials and media are synthetic.
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { createServer as createPort } from "node:net";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const project=resolve(import.meta.dirname,"../..");
const data=resolve(project,".cache/native-private-account-matrix",randomUUID());await mkdir(data,{recursive:true});
const encoder=await configureFixtureTools(project,data);
const fixtureApp=await stageFixtureApp(project,data,"saveddesk-account-fixture.exe");
const video=resolve(data,"fixture.mp4");const image=resolve(data,"fixture.jpg");
for(const args of [["-f","lavfi","-i","color=c=0x26c6b1:s=640x360:r=24:d=1","-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-t","1","-c:v","libx264","-preset","veryfast","-c:a","aac","-pix_fmt","yuv420p",video],["-i",video,"-frames:v","1",image]]){
  const result=spawnSync(encoder,["-nostdin","-hide_banner","-loglevel","error","-n",...args.slice(0,-1),"-threads","1","-filter_threads","1",args.at(-1)],{windowsHide:true,timeout:30000});if(result.status!==0)throw new Error("Fixture encoding failed");
}
const videoBytes=await readFile(video),imageBytes=await readFile(image);
let changedIdentity=false;
const requests=[];let items=[{id:"asset1",post:"123456789",num:1},{id:"asset2",post:"123456789",num:2}];let delay=0;
const server=createServer((request,response)=>{
  requests.push({path:request.url,cookie:request.headers.cookie,authorization:request.headers.authorization});
  if(request.url.startsWith("/viewer/")){response.setHeader("Content-Type","application/json");response.end(JSON.stringify(request.url.endsWith("instagram")?{user:{pk:changedIdentity?84:42,username:"fixture_user"}}:{users:[{user_id:changedIdentity?146:73,screen_name:"fixture_x"}]}));}
  else if(request.url==="/items")response.end(JSON.stringify(items));
  else if(request.url==="/video.mp4"||request.url.startsWith("/media/"))setTimeout(()=>{
    const payload=request.url==="/video.mp4"?videoBytes:imageBytes;response.setHeader("Content-Length",payload.length);let offset=0;
    const send=()=>{if(response.destroyed)return;const end=Math.min(payload.length,offset+Math.ceil(payload.length/8));response.write(payload.subarray(offset,end));offset=end;if(offset>=payload.length)response.end();else setTimeout(send,80);};send();
  },delay);
  else {response.writeHead(404);response.end();}
});await new Promise(done=>server.listen(0,"127.0.0.1",done));
const port=await new Promise(done=>{const finder=createPort();finder.listen(0,"127.0.0.1",()=>{const port=finder.address().port;finder.close(()=>done(port));});});
const env={...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_REQUIRE_PACKAGED_WORKER:"1",SAVEDDESK_TEST_PLATFORM_ORIGIN:`http://127.0.0.1:${server.address().port}`,SAVEDDESK_TEST_PIPE_SUFFIX:randomUUID(),WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`};
const app=spawn(fixtureApp.executable,[],{windowsHide:true,env,stdio:["ignore","pipe","pipe"]});let browser,db,output="";
for(const stream of [app.stdout,app.stderr])stream.on("data",b=>output=(output+b.toString()).slice(-4000));
function nativeMessage(value,allowed=true){
  return new Promise((done,reject)=>{
    const child=spawn(fixtureApp.host,[allowed?"chrome-extension://chjglnciihblkjnhnpinocknamjoecim/":"chrome-extension://unapproved/"],{windowsHide:true,env,stdio:["pipe","pipe","pipe"]});
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
  await invoke("get_snapshot");db=new DatabaseSync(resolve(data,"prototype-catalog.db"),{});
  const downloads=resolve(data,"downloads");await mkdir(downloads,{recursive:true});await invoke("save_settings",{settings:{downloadFolder:downloads,lowResource:true,quality:"original",profile:"original"}});
  const targets={instagram:"https://www.instagram.com/fixture_user/saved/private/123456789/",x:"",youtube:"https://www.youtube.com/watch?v=BaW_jenozKc",facebook:"https://www.facebook.com/reel/123456789/",tiktok:"https://www.tiktok.com/@fixture_user/photo/123456789",pinterest:"https://www.pinterest.com/example/my-board/",reddit:"https://www.reddit.com/comments/abc123/",discord:"https://cdn.discordapp.com/attachments/111/222/image.jpg?ex=abcdef&is=123abc&hm=abc123"};
  const sessionCookies={instagram:[{name:"sessionid",value:"synthetic-instagram-secret"}],x:[{name:"auth_token",value:"synthetic-x-secret"},{name:"ct0",value:"synthetic-x-csrf"}],youtube:[{name:"SAPISID",value:"synthetic-youtube-secret"}],facebook:[{name:"c_user",value:"42"},{name:"xs",value:"synthetic-facebook-secret"}],tiktok:[{name:"sessionid",value:"synthetic-tiktok-secret"}],pinterest:[{name:"_pinterest_sess",value:"synthetic-pinterest-secret"},{name:"_auth",value:"1"}]};
  async function approve(source,changed=false){
    await invoke("begin_connection",{source,browser:"chrome"});
    let pending;await expect.poll(async()=>{pending=await nativeMessage({protocol_version:1,command:"request"});return pending?.ok;},{timeout:15000}).toBe(true);expect(pending.source).toBe(source);
    const cookies=sessionCookies[source].map((c,index)=>({...c,value:c.value+(changed&&index===0?"-rotated":""),domain:`.${source}.com`,path:"/",secure:true,httpOnly:true}));
    const response=await nativeMessage({protocol_version:1,command:"authorize",source,browser:"chrome",nonce:pending.nonce,cookies,user_agent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"});expect(response.ok).toBe(true);
    await expect.poll(()=>db.prepare("SELECT state FROM accounts WHERE source=?").get(source).state,{timeout:65000}).toBe(["instagram","x"].includes(source)?"connected":"session_ready");
    const row=db.prepare("SELECT * FROM accounts WHERE source=?").get(source);if(["instagram","x"].includes(source)){expect(row.account_id).toMatch(/^\d+$/);}else{expect(row.account_id).toMatch(/^session_[0-9a-f]{64}$/);expect(row.verified_at).toBe(null);}
    expect(await nativeMessage({protocol_version:1,command:"connection_status",source,browser:"chrome"})).toMatchObject({ok:true,state:["instagram","x"].includes(source)?"connected":"session_ready"});
    const protectedBytes=await readFile(resolve(data,`session-${source}.dpapi`));expect(protectedBytes.toString()).not.toContain("synthetic-");return row.account_id;
  }
  const wait=async id=>{await expect.poll(()=>db.prepare("SELECT state FROM download_jobs WHERE id=?").get(id).state,{timeout:90000}).toMatch(/completed|failed/);const row=db.prepare("SELECT * FROM download_jobs WHERE id=?").get(id);expect(row.error).toBe("");expect(row.state).toBe("completed");return row;};
  const prepare=source=>invoke("prepare_download",{request:{source,target:targets[source],title:`${source} authenticated test`,quality:"original",profile:"original"}});
  await page.evaluate(async()=>{window.progressEvents=[];await window.__TAURI_INTERNALS__.invoke("plugin:event|listen",{event:"worker-event",target:{kind:"Any"},handler:window.__TAURI_INTERNALS__.transformCallback(event=>{if(event.payload.event==="download_progress")window.progressEvents.push(event.payload);})});});

  const cases=[];
  const record=(source,name)=>{cases.push({source,case:name,passed:true});console.log(source,name);};
  const rejected=async promise=>{expect(await promise.then(()=>false,()=>true)).toBe(true);};
  for(const source of Object.keys(sessionCookies)){
    changedIdentity=false;
    await invoke("begin_connection",{source,browser:"chrome"});
    const pending=await nativeMessage({protocol_version:1,command:"request"});expect(pending.ok).toBe(true);
    const cookies=sessionCookies[source].map(c=>({...c,domain:`.${source}.com`,path:"/",secure:true,httpOnly:true}));
    const approval={protocol_version:1,command:"authorize",source,browser:"chrome",nonce:pending.nonce,cookies};
    expect((await nativeMessage({...approval,nonce:"wrong"})).ok).toBe(false);record(source,"wrong-nonce-rejected");
    for(const other of Object.keys(sessionCookies).filter(x=>x!==source)){
      expect((await nativeMessage({...approval,source:other})).ok).toBe(false);record(source,"cross-platform-approval-rejected-"+other);
    }
    const foreignAck=await nativeMessage({...approval,cookies:cookies.map(c=>({...c,domain:".unrelated.test"}))});
    if(foreignAck.ok){
      await expect.poll(()=>db.prepare("SELECT state FROM accounts WHERE source=?").get(source)?.state,{timeout:65000}).toBe("sign_in_needed");
      expect((await readdir(data)).includes(`session-${source}.dpapi`)).toBe(false);
      await invoke("begin_connection",{source,browser:"chrome"});
      const fresh=await nativeMessage({protocol_version:1,command:"request"});expect(fresh.ok).toBe(true);approval.nonce=fresh.nonce;
    }
    record(source,"foreign-cookie-domain-rejected-before-session-storage");
    expect((await nativeMessage(approval)).ok).toBe(true);
    await expect.poll(()=>db.prepare("SELECT state FROM accounts WHERE source=?").get(source)?.state,{timeout:65000}).toBe(["instagram","x"].includes(source)?"connected":"session_ready");
    expect((await nativeMessage(approval)).ok).toBe(false);record(source,"approval-replay-rejected");
    const draft=await prepare(source);const id=await invoke("start_download",{token:draft.token,mode:"new_only"});const job=await wait(id);expect(job.saved).toBeGreaterThan(0);record(source,"matching-session-and-isolated-private-fixture-download");
    const row=db.prepare("SELECT * FROM accounts WHERE source=?").get(source);const sessionPath=resolve(data,`session-${source}.dpapi`);const bytes=await readFile(sessionPath);
    db.prepare("UPDATE accounts SET account_id='scope_mismatch' WHERE source=?").run(source);await rejected(prepare(source));record(source,"catalog-session-binding-mismatch-rejected");db.prepare("UPDATE accounts SET account_id=? WHERE source=?").run(row.account_id,source);
    await unlink(sessionPath);await rejected(prepare(source));record(source,"missing-protected-session-rejected");await writeFile(sessionPath,bytes);
    await writeFile(sessionPath,Buffer.from("not a DPAPI envelope"));await rejected(prepare(source));record(source,"corrupted-protected-session-rejected");await writeFile(sessionPath,bytes);
    db.prepare("UPDATE accounts SET state='expired' WHERE source=?").run(source);
    if(["instagram","x"].includes(source))await rejected(prepare(source));else expect((await prepare(source)).token).toBeTruthy();
    record(source,["instagram","x"].includes(source)?"expired-required-account-rejected":"expired-optional-session-uses-public-scope");db.prepare("UPDATE accounts SET state=? WHERE source=?").run(row.state,source);
    const stale=await prepare(source);changedIdentity=true;await approve(source,true);await rejected(invoke("start_download",{token:stale.token,mode:"new_only"}));record(source,"account-replaced-after-preparation-rejected");
    await invoke("disconnect_account",{source});expect((await readdir(data)).includes(`session-${source}.dpapi`)).toBe(false);record(source,"disconnect-removes-session-keeps-completed-content");
    expect(db.prepare("SELECT count(*) n FROM media_files WHERE job_id=?").get(id).n).toBe(job.saved);
  }
  expect(errors).toHaveLength(0);expect((await page.content()).includes("synthetic-")).toBe(false);
  const report={passed:true,cases,case_count:cases.length,platforms:Object.keys(sessionCookies),app_version:"0.2.7",app_sha256:fixtureApp.sha256,scope:"Isolated native app and packaged engines, synthetic platform-scoped accounts/content only. Exhaustive defined matrix, not all real provider account combinations."};
  await writeFile(resolve(data,"acceptance.json"),JSON.stringify(report,null,2));console.log("Private account boundary matrix passed:",cases.length,data);
}catch(error){console.error(error);process.exitCode=1;}
finally{db?.close();if(browser)await browser.close();if(app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});server.closeAllConnections();server.close();}
