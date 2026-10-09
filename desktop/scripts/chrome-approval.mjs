import {configureFixtureTools} from "./fixture-tools.mjs";
// Installed Chrome + real native messaging, with an empty owned browser profile.
// Only the test copy of the manifest pre-grants platform host permissions to
// avoid automating Chrome's OS permission dialog. Production keeps optional
// permissions; popup unit tests verify approval/denial and platform-only scopes.
// Requires the user's explicit Chrome connector registration to exist already.
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { createServer as createPort } from "node:net";
import { randomUUID } from "node:crypto";

const project=resolve(import.meta.dirname,"../..");
const data=resolve(project,".cache/chrome-approval",randomUUID());
const extension=resolve(data,"connector");
await mkdir(extension,{recursive:true});
await mkdir(resolve(data,"app"),{recursive:true});
await configureFixtureTools(project,resolve(data,"app"));
const packaged=resolve(project,"desktop/src-tauri/target/debug/browser-connector/chromium");
const manifest=JSON.parse(await readFile(resolve(packaged,"manifest.json"),"utf8"));
manifest.host_permissions=[...manifest.optional_host_permissions];
await writeFile(resolve(extension,"manifest.json"),JSON.stringify(manifest));
for(const name of ["popup.js","popup.html","popup.css"]) await copyFile(resolve(packaged,name),resolve(extension,name));
let rejectVerification=false;
let verificationAgent="";
let verificationCalls=0;
const fixture=createServer((request,response)=>{
  response.setHeader("Content-Type","application/json");
  if(request.url.startsWith("/viewer/") || request.url.startsWith("/profile/")){verificationAgent=request.headers["user-agent"] || "";verificationCalls++;}
  if(request.url==="/viewer/instagram" && rejectVerification){response.writeHead(429);response.end(JSON.stringify({message:"useragent mismatch",private:"private-platform-response"}));}
  else if(request.url==="/viewer/instagram")response.end(JSON.stringify({form_data:{username:"chrome_fixture_ig"}}));
  else if(request.url==="/viewer/x")response.end(JSON.stringify({users:[{user_id:"73",screen_name:"chrome_fixture_x"}]}));
  else if(request.url==="/profile/instagram/by-id/42")response.end(JSON.stringify({user:{pk:42,username:"chrome_fixture_ig"}}));
  else if(request.url.startsWith("/profile/instagram"))response.end(JSON.stringify({data:{user:{id:"42",username:"chrome_fixture_ig"}}}));
  else if(request.url.startsWith("/profile/x"))response.end(JSON.stringify({data:{user:{result:{rest_id:"73",core:{screen_name:"chrome_fixture_x"},legacy:{}}}}}));
  else {response.writeHead(404);response.end();}
});
await new Promise(done=>fixture.listen(0,"127.0.0.1",done));
const port=await new Promise(done=>{const finder=createPort();finder.listen(0,"127.0.0.1",()=>{const value=finder.address().port;finder.close(()=>done(value));});});
const env={...process.env,SAVEDDESK_TEST_DATA_DIR:resolve(data,"app"),SAVEDDESK_REQUIRE_PACKAGED_WORKER:"1",SAVEDDESK_TEST_PIPE_SUFFIX:randomUUID(),SAVEDDESK_TEST_PLATFORM_ORIGIN:`http://127.0.0.1:${fixture.address().port}`,WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`};
let context,webview,app;
try {
  context=await chromium.launchPersistentContext(resolve(data,"chrome"),{executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true,env,ignoreDefaultArgs:["--disable-extensions"],args:["--enable-unsafe-extension-debugging"]});
  const cdp=await context.browser().newBrowserCDPSession();
  const loaded=await cdp.send("Extensions.loadUnpacked",{path:extension});
  expect(loaded.id).toBe("chjglnciihblkjnhnpinocknamjoecim");
  const popup=await context.newPage();
  const browserAgent=await popup.evaluate(()=>navigator.userAgent);
  const errors=[];popup.on("pageerror",error=>errors.push(error.message));
  await popup.goto(`chrome-extension://${loaded.id}/popup.html`);
  await expect(popup.locator("#status")).toContainText("click Connect for this platform first",{timeout:15000});
  await expect(popup.locator("#approve")).toBeDisabled();
  await expect(popup.locator("#check")).toBeEnabled();
  app=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk.exe"),[],{windowsHide:true,env,stdio:"ignore"});
  for(let attempt=0;attempt<120;attempt++){
    if(app.exitCode!==null)throw new Error("The owned native test app exited before loading.");
    try {await fetch(`http://127.0.0.1:${port}/json/version`);break;}
    catch {await new Promise(done=>setTimeout(done,250));}
  }
  webview=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page=webview.contexts()[0].pages()[0];
  await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible();
  const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
  await context.addCookies([
    {name:"sessionid",value:"42%3Asynthetic_private_token%3A10%3Asynthetic_private_signature",domain:".instagram.com",path:"/",httpOnly:true,secure:true},
    {name:"ds_user_id",value:"42",domain:".instagram.com",path:"/",secure:true},
    {name:"auth_token",value:"synthetic-chrome-x",domain:".x.com",path:"/",httpOnly:true,secure:true},
    {name:"ct0",value:"synthetic-chrome-csrf",domain:".x.com",path:"/",secure:true},
    {name:"unrelated",value:"unrelated-chrome-secret",domain:".example.com",path:"/",secure:true},
  ]);
  for(const source of ["instagram","x"]){
    const requestsBeforeApproval=verificationCalls;
    await invoke("begin_connection",{source,browser:"chrome"});
    await popup.bringToFront();
    await popup.locator("#check").click();
    await expect(popup.locator("#approve")).toBeEnabled({timeout:15000});
    await expect(popup.locator("#approve")).toHaveText(`Approve ${source==="x"?"X":"Instagram"} connection`);
    await popup.locator("#approve").click();
    await expect(popup.locator("#status")).toContainText("SavedDesk is verifying your account",{timeout:15000});
    await expect(popup.locator("#approve")).toBeDisabled();
    await expect.poll(async()=>{
      const snapshot=await invoke("get_snapshot");return snapshot.accounts.find(account=>account.source===source)?.state;
    },{timeout:65000}).toBe("connected");
    await expect(popup.locator("#status")).toContainText(`Connected as @chrome_fixture_${source==="x"?"x":"ig"}`,{timeout:65000});
    if(source==="instagram"){expect(verificationAgent).toBe(browserAgent);expect(verificationCalls-requestsBeforeApproval).toBe(1);}
    const html=await page.content();
    for(const secret of ["synthetic_private_token","synthetic_private_signature","synthetic-chrome-x","unrelated-chrome-secret"])expect(html.includes(secret)).toBe(false);
    await new Promise(done=>setTimeout(done,300));
  }
  const requestsBeforeFailure=verificationCalls;
  rejectVerification=true;
  await invoke("begin_connection",{source:"instagram",browser:"chrome"});
  await popup.locator("#check").click();
  await expect(popup.locator("#approve")).toBeEnabled({timeout:15000});
  await popup.locator("#approve").click();
  await expect(popup.locator("#status")).toContainText("not connected",{timeout:65000});
  await expect(popup.locator("#status")).toContainText("HTTP 429: useragent mismatch");
  expect((await popup.content()).includes("private-platform-response")).toBe(false);
  const failed=await invoke("get_snapshot");
  expect(failed.accounts.find(account=>account.source==="instagram").state).toBe("sign_in_needed");
  expect(failed.accounts.find(account=>account.source==="instagram").message).toContain("HTTP 429: useragent mismatch");
  expect(verificationCalls-requestsBeforeFailure).toBe(1);
  expect(verificationAgent).toBe(browserAgent);
  expect(errors).toEqual([]);
  process.stdout.write(`Installed Chrome test passed: host startup, disabled-button recovery, real extension approval, Instagram/X web identity resolution, final success/failure status. Synthetic profile: ${data}\n`);
} finally {
  if(context)await context.close();
  if(webview)await webview.close();
  if(app?.pid && app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});
  await new Promise(done=>fixture.close(done));
}
