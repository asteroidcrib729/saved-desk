// Real native commands in an isolated Windows user-data folder; no live provider login.
import {chromium,expect} from "@playwright/test";
import {spawn,spawnSync} from "node:child_process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createServer} from "node:net";
import {randomUUID,createHash} from "node:crypto";
const root=resolve(import.meta.dirname,"../.."),data=resolve(root,".cache/native-authentication",randomUUID()),exe=process.env.SAVEDDESK_QA_EXE||resolve(root,"desktop/src-tauri/target/debug/saveddesk.exe");
await mkdir(data,{recursive:true});
let app,browser,page;
const errors=[];
async function launch(){
 const port=await new Promise(done=>{const s=createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>done(p));});});
 app=spawn(exe,[],{windowsHide:true,stdio:"ignore",env:{...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_REQUIRE_PACKAGED_WORKER:"1",WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
 for(let i=0;i<120;i++){if(app.exitCode!==null)throw Error("Isolated app exited.");try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(r=>setTimeout(r,250));}}
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);page=browser.contexts()[0].pages()[0];page.on("pageerror",e=>errors.push(e.message));await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible();
}
async function stop(){if(browser){await browser.close();browser=null;}if(app?.pid&&app.exitCode===null){spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});await new Promise(r=>app.exitCode!==null?r():app.once("exit",r));}}
async function invoke(command,args){return page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});}
async function rejected(command,args){try{await invoke(command,args);}catch(error){return String(error);}throw Error('The native command unexpectedly succeeded.');}
const checks=[];
try{
 await launch();let report=await invoke("get_authentication");
 expect(report.providers).toHaveLength(5);expect(report.google.state).toBe("setup_required");checks.push("native provider registry and setup state");
 for(const source of ["facebook","tiktok","pinterest"]){const provider=report.providers.find(p=>p.source===source);expect(provider.privateMedia).toBe("excluded");expect(provider.requirement).not.toMatch(/secret-read|Portability|registration is required/);}
 expect(report.providers.find(p=>p.source==="pinterest").identityFlow).toBe("public_links");checks.push("actual native registry excludes private Facebook TikTok Pinterest and Pinterest setup");
 expect(await rejected("configure_google_identity",{clientId:"NOT_A_CLIENT"})).toContain("Desktop OAuth client ID");checks.push("invalid configuration rejected");
 await page.getByRole("button",{name:"Accounts",exact:true}).click();await page.getByText("Configure Google Desktop sign-in",{exact:true}).click();await page.getByRole("textbox",{name:"Google Desktop client ID"}).fill("123-native-fixture.apps.googleusercontent.com");
 await page.getByRole("button",{name:"Save client ID",exact:true}).click();await expect(page.locator(".identity-panel").getByText("Not connected",{exact:true})).toBeVisible();checks.push("actual UI saves through native command");
 const encrypted=await readFile(resolve(data,"oauth-google.dpapi"));expect(encrypted.toString("utf8")).not.toContain("123-native-fixture");checks.push("configuration is DPAPI protected");
 expect(await rejected("check_google_identity")).toContain("Sign in with Google first");await invoke("cancel_google_identity");await invoke("disconnect_google_identity",{revoke:false});checks.push("no identity inferred from configuration");
 await stop();await launch();report=await invoke("get_authentication");expect(report.google.clientId).toBe("123-native-fixture.apps.googleusercontent.com");expect(report.google.accountKey).toBeNull();checks.push("configuration persists across app restart");
 await page.getByRole("button",{name:"Try sample collection"}).click();await expect(page.getByTestId("library-list").locator("article")).toHaveCount(3,{timeout:30000});checks.push("packaged worker and catalog remain usable");
 await invoke("reset_google_identity");expect((await invoke("get_authentication")).google.state).toBe("setup_required");checks.push("native reset clears only local OAuth setup");
 expect(errors).toEqual([]);const result={passed:true,version:JSON.parse(await readFile(resolve(root,"desktop/package.json"),"utf8")).version,app_sha256:createHash("sha256").update(await readFile(exe)).digest("hex"),checks,private_provider_login:"not_tested_outside_public_only_scope",data};
 await writeFile(resolve(data,"result.json"),JSON.stringify(result,null,2));await page.getByRole("button",{name:"Accounts",exact:true}).click();await page.screenshot({path:resolve(data,"accounts.png")});console.log(JSON.stringify(result,null,2));
}finally{await stop();}
