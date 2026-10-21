// Synthetic app/native-host round trips. Never use real browser registry keys.
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID,createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const project=resolve(import.meta.dirname,"../..");
const id=randomUUID(),data=resolve(tmpdir(),"saveddesk-certification-"+id);
const evidence=resolve(project,".cache/certification-native",id);await mkdir(data,{recursive:true});await mkdir(evidence,{recursive:true});
const port=await new Promise(done=>{const server=createServer();server.listen(0,"127.0.0.1",()=>{const value=server.address().port;server.close(()=>done(value));});});
const env={...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_TEST_PIPE_SUFFIX:id,SAVEDDESK_TEST_REGISTRY_SCOPE:id,
 WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`};
const app=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk.exe"),[],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
let output="",browser,db;for(const stream of [app.stdout,app.stderr])stream.on("data",chunk=>output=(output+chunk).slice(-4000));
const checks=[];
async function message(value,allowed=true){
 return new Promise((done,reject)=>{
  const child=spawn(resolve(project,"desktop/src-tauri/target/debug/saveddesk-native-host.exe"),[allowed?"chrome-extension://chjglnciihblkjnhnpinocknamjoecim/":"chrome-extension://unapproved/"],{env,windowsHide:true,stdio:["pipe","pipe","pipe"]});
  let bytes=Buffer.alloc(0);const timer=setTimeout(()=>{child.kill();reject(new Error("Native status deadline exceeded"));},10000);
  child.on("error",reject);child.stdout.on("data",chunk=>bytes=Buffer.concat([bytes,chunk]));child.stdin.on("error",()=>{});
  child.on("exit",()=>{clearTimeout(timer);try{if(bytes.length<4){done(null);return;}expect(bytes.readUInt32LE(0)).toBe(bytes.length-4);done(JSON.parse(bytes.subarray(4).toString()));}catch(error){reject(error);}});
  const body=Buffer.from(JSON.stringify(value)),length=Buffer.alloc(4);length.writeUInt32LE(body.length);child.stdin.end(Buffer.concat([length,body]));
 });
}
try {
 for(let n=0;n<180;n++){if(app.exitCode!==null)throw new Error("Isolated app exited: "+output);try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(done=>setTimeout(done,250));}}
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];
 await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible({timeout:30000});
 const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
 const metadata=await invoke("get_connector_maintenance");expect(resolve(metadata.directory)).toBe(resolve(data));
 await invoke("setup_connector",{browser:"edge",consent:true});
 const manifest=JSON.parse(await readFile(resolve(data,"connector-edge.json"),"utf8"));expect(manifest.name).toBe("com.saveddesk.connector");
 checks.push("isolated-selected-browser-setup-and-cleanup-helper-export");
 const probe=await message({protocol_version:1,command:"connector_probe",browser:"edge",extension_version:"0.2.12"});expect(probe.ok).toBe(true);expect(probe.ready).toBe(true);
 expect((await invoke("get_browser_connector_status",{browser:"edge"})).verified).toBe(true);
 checks.push("external-host-probe-through-private-app-status-pipe");
 db=new DatabaseSync(resolve(data,"prototype-catalog.db"));
 db.prepare("INSERT INTO accounts(source,account_id,username,browser,state,message) VALUES('x','fixture','fixture-user','edge','sign_in_needed','Synthetic status only') ON CONFLICT(source) DO UPDATE SET account_id='fixture',username='fixture-user',browser='edge',state='sign_in_needed',message='Synthetic status only'").run();
 const secret=resolve(data,"session-x.dpapi");await writeFile(secret,"synthetic-account-keep");
 const before=createHash("sha256").update(await readFile(secret)).digest("hex");
 const status=await message({protocol_version:1,command:"connection_status",source:"x",browser:"edge"});
 expect(status.ok).toBe(true);expect(status.username).toBe("fixture-user");expect(status.message).toBe("Synthetic status only");expect(JSON.stringify(status)).not.toContain("synthetic-account-keep");
 expect((await message({protocol_version:1,command:"connection_status",source:"x",browser:"chrome"})).ok).toBe(false);
 expect(await message({protocol_version:1,command:"connection_status",source:"x",browser:"edge"},false)).toBeNull();
 expect(createHash("sha256").update(await readFile(secret)).digest("hex")).toBe(before);
 checks.push("scoped-status-no-account-file-access-or-unapproved-origin-response");
 const removed=await invoke("remove_browser_connector");expect(removed.message).toContain("removed");
 expect(createHash("sha256").update(await readFile(secret)).digest("hex")).toBe(before);
 expect(db.prepare("SELECT username FROM accounts WHERE source='x'").get().username).toBe("fixture-user");
 expect((await invoke("get_browser_connector_status",{browser:"edge"})).registered).toBe(false);
 checks.push("native-cleanup-removes-owned-test-registration-and-keeps-library-and-account-data");
 const report={passed:true,app_version:"0.2.12",checks,data,evidence,uses_real_browser_registration:false,packaged_msix_test:false};
 await writeFile(resolve(evidence,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await writeFile(resolve(evidence,"failure.json"),JSON.stringify({passed:false,error:String(error),output,checks},null,2));throw error;}
finally{
 if(db)db.close();if(browser)await browser.close();if(app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});
 // This exact UUID-scoped fixture key is the only registry cleanup performed here.
 spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",`$key='HKCU:\\Software\\SavedDesk\\CertificationTests\\${id}';if(Test-Path -LiteralPath $key){Remove-Item -LiteralPath $key -Recurse -Force}`],{windowsHide:true});
}
