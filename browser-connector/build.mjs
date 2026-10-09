import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
const root=import.meta.dirname;
const identity=JSON.parse(await readFile(resolve(root,"identity.json"),"utf8"));
const {version}=JSON.parse(await readFile(resolve(root,"../desktop/package.json"),"utf8"));
const base={manifest_version:3,name:"SavedDesk Browser Connector",version,description:"Approve only the selected platform session for SavedDesk on this PC.",permissions:["cookies","nativeMessaging"],optional_host_permissions:["https://*.instagram.com/*","https://*.x.com/*","https://*.twitter.com/*","https://*.youtube.com/*","https://*.facebook.com/*","https://*.tiktok.com/*","https://*.pinterest.com/*"],action:{default_popup:"popup.html",default_title:"Connect an account to SavedDesk"}};
for (const browser of ["chromium","firefox"]) {
  const manifest=browser==="chromium"?{...base,key:identity.key}:{...base,browser_specific_settings:{gecko:{id:identity.firefoxId,strict_min_version:"140.0",data_collection_permissions:{required:["authenticationInfo"]}}}};
  for (const destination of [resolve(root,browser),resolve(root,"../desktop/src-tauri/resources/browser-connector",browser)]) {
    await mkdir(destination,{recursive:true});
    await writeFile(resolve(destination,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
    for(const filename of ["popup.html","popup.js","popup.css"]) await copyFile(resolve(root,filename),resolve(destination,filename));
  }
}
process.stdout.write(`Connector packages built. Chromium ID: ${identity.chromiumId}\n`);
