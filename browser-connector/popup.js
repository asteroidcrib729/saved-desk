/* No content scripts, external messages, cookies in storage, analytics, or logging. */
const api = globalThis.browser ?? chrome;
let pairing;
const pairingInput = document.querySelector("#pairing-code");
const pair = document.querySelector("#pair");
const forget = document.querySelector("#forget");
function parsePairing(value) {
  const match = /^SD1\.([0-9]{4,5})\.(edge|chrome|brave|vivaldi|chromium|firefox)\.([a-f0-9]{64})$/.exec(value.trim());
  if (!match || Number(match[1]) < 1024 || Number(match[1]) > 65535) throw new Error("Paste the private pairing code from SavedDesk Accounts > browser setup.");
  return { port:Number(match[1]), browser:match[2], token:match[3] };
}
async function send(message) {
  if (!pairing) throw new Error("Pair this extension with SavedDesk using the private code from Accounts > browser setup.");
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",encoder.encode(pairing.token),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
  const nonce=Math.floor(Date.now()/1000)+"-"+crypto.randomUUID().replaceAll("-","");
  const body=JSON.stringify(message);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(nonce+"\n"+body))),byte=>byte.toString(16).padStart(2,"0")).join("");
  const response = await fetch("http://127.0.0.1:" + pairing.port + "/connector", {
    method:"POST", headers:{"Content-Type":"application/json", Authorization:"SavedDesk "+pairing.browser+"."+nonce+"."+signature},
    body, credentials:"omit", redirect:"error", cache:"no-store",
    referrerPolicy:"no-referrer", signal:AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("SavedDesk refused this pairing. Update the extension and pair it again from Accounts.");
  const responseBody=await response.text();
  const serverProof=response.headers.get("X-SavedDesk-Proof") || "";
  if (!/^[a-f0-9]{64}$/.test(serverProof) || !await crypto.subtle.verify("HMAC",key,Uint8Array.from(serverProof.match(/../g),byte=>parseInt(byte,16)),encoder.encode(nonce+"\n"+responseBody))) throw new Error("The local application could not prove its identity. No account session was sent. Keep SavedDesk open and retry.");
  return JSON.parse(responseBody);
}
pair.addEventListener("click", async () => {
  pair.disabled=true; approve.disabled=true; pending=null; approved=null; clearTimeout(statusTimer);
  try {
    const code=pairingInput.value.trim();
    const candidate=parsePairing(code);
    // Permission request stays within the explicit button gesture.
    if (!await api.permissions.request({origins:["http://127.0.0.1/*"]})) throw new Error("Local connection permission was declined.");
    pairing=candidate;
    const probe=await send({protocol_version:1,command:"connector_probe",browser:await provider(),extension_version:api.runtime.getManifest().version});
    if (!probe?.ok) throw new Error(probe?.message || "The pairing could not be checked.");
    await api.storage.local.set({pairingCode:code});
    pairingInput.value="";
    await request();
  } catch (error) { pairing=null; status.textContent=connectionHelp(error); }
  finally { pair.disabled=false; }
});
forget.addEventListener("click", async () => {
  await api.storage.local.remove("pairingCode");
  pairing=null; pending=null; approved=null; clearTimeout(statusTimer); pairingInput.value=""; approve.disabled=true;
  status.textContent="This extension forgot its pairing. Remove browser pairing in SavedDesk to invalidate other copies of the code.";
});
const approve = document.querySelector("#approve");
const status = document.querySelector("#status");
let hostChecked=false;
const scope = document.querySelector("#scope");
const check = document.querySelector("#check");
let pending;
let approved;
let statusTimer;
async function provider() {
  if (api.runtime.getBrowserInfo) return "firefox";
  if (navigator.userAgent.includes("Edg/")) return "edge";
  if (navigator.brave && await navigator.brave.isBrave()) return "brave";
  // Vivaldi/Chromium may use a Chrome UA. Desktop selection is shown for explicit review.
  return "chromium-family";
}
function connectionHelp(error) {
  const message = error?.message || "The desktop request could not be checked.";
  return message + " Keep SavedDesk open. Pair the updated extension from Accounts > browser setup, then start Connect in SavedDesk.";
}
async function request() {
  if (approved) { await verificationStatus(); return; }
  pending = null;
  approve.disabled = true;
  check.disabled = true;
  pair.disabled = true; forget.disabled = true;
  scope.textContent = "Checking the request from SavedDesk...";
  status.textContent = "Checking the desktop request...";
  try {
    const detected = await provider();
    const checked = await send({protocol_version:1,command:"connector_probe",browser:detected,extension_version:api.runtime.getManifest().version});
    if (!checked?.ok) throw new Error(checked?.message || "The browser extension could not connect to SavedDesk.");
    hostChecked=true;
    const requested = await send({ protocol_version: 1, command: "request" });
    if (!requested?.ok && /No connection|No .*request|Start Connect|click Connect|unavailable|not.*connect/i.test(requested?.message || "")) {
      scope.textContent="Your browser extension is connected to SavedDesk.";
      status.textContent="Return to SavedDesk, check the extension connection, choose a platform and click Connect. Then return here to approve it. Signing in on the platform website alone does not connect SavedDesk.";
      return;
    }
    if (!requested?.ok || !["instagram","x","youtube","facebook","tiktok","pinterest"].includes(requested.source)) throw new Error(requested?.message || "No connection request is waiting.");
    const browser = await provider();
    if ((browser === "firefox" || browser === "edge" || browser === "brave") && requested.browser !== browser) throw new Error("Select this browser on the Accounts screen and start the connection again.");
    if (browser === "chromium-family" && !["chrome","chromium","vivaldi"].includes(requested.browser)) throw new Error("Select this browser on the Accounts screen and start the connection again.");
    pending = requested;
    scope.textContent = `SavedDesk is requesting your ${({x:"X",instagram:"Instagram",youtube:"YouTube",facebook:"Facebook",tiktok:"TikTok",pinterest:"Pinterest"}[pending.source])} account from this ${pending.browser} profile.`;
    approve.textContent = `Approve ${({x:"X",instagram:"Instagram",youtube:"YouTube",facebook:"Facebook",tiktok:"TikTok",pinterest:"Pinterest"}[pending.source])} connection`;
    approve.disabled = false;
    status.textContent = "Make sure you are signed in to the intended account in this profile.";
  } catch (error) { status.textContent = hostChecked && /No connection|No .*request|Start Connect|not.*connect|pipe/i.test(error?.message || "") ? "Browser extension connected. Return to SavedDesk, check the extension connection and start a platform connection. Then choose Check connection again here." : connectionHelp(error); }
  finally { check.disabled = false; pair.disabled = false; forget.disabled = false; }
}
async function verificationStatus() {
  if (!approved) return;
  clearTimeout(statusTimer);
  try {
    const result = await send({protocol_version:1,command:"connection_status",source:approved.source,browser:approved.browser});
    if (!result?.ok) throw new Error(result?.message || "The verification result is unavailable. Check Accounts in SavedDesk.");
    if (result.state === "session_ready") {
      status.textContent = "Browser session approved. SavedDesk will check access when downloading the selected content; no account identity has been verified.";
      approved = null;
    } else if (result.state === "connected") {
      status.textContent = `Connected as @${result.username}. You can now add a download in SavedDesk.`;
      approved = null;
    } else if (["awaiting_permission","connecting"].includes(result.state)) {
      status.textContent = "Permission received. SavedDesk is still verifying your account; it is not connected yet.";
      if (Date.now() < approved.deadline) statusTimer = setTimeout(verificationStatus, 1000);
      else status.textContent = "Verification is taking longer than expected. Check Accounts in SavedDesk or choose Check connection again.";
    } else {
      status.textContent = "Permission was received, but the account is not connected. " + (result.message || "Start Connect again in SavedDesk.");
      approved = null;
    }
  } catch (error) {
    status.textContent = "Permission was received; account verification is not confirmed. " + (error.message || "Check Accounts in SavedDesk.");
  }
}
check.addEventListener("click", request);
approve.addEventListener("click", async () => {
  if (!pending || approve.disabled) return;
  approve.disabled = true;
  check.disabled = true;
  pair.disabled = true; forget.disabled = true;
  try {
    const domains = {instagram:["instagram.com"],x:["x.com","twitter.com"],youtube:["youtube.com"],facebook:["facebook.com"],tiktok:["tiktok.com"],pinterest:["pinterest.com"]}[pending.source];
    const origins = domains.map(domain => `https://*.${domain}/*`);
    if (!await api.permissions.request({ origins })) throw new Error("Browser permission was declined. Nothing was connected.");
    const tabs = await api.tabs.query({active:true,currentWindow:true});
    const stores = await api.cookies.getAllCookieStores();
    const store = stores.find(entry => entry.tabIds.includes(tabs[0]?.id));
    if (!store) throw new Error("Select a signed-in browser tab in the intended profile, then reopen this connector.");
    if (pending.browser === "firefox" && store.id !== "firefox-default") throw new Error("Firefox containers/private sessions are not supported yet. Use the normal signed-in profile.");
    const cookies = [];
    for (const domain of domains) {
      const entries = await api.cookies.getAll({ domain, storeId: store.id });
      for (const entry of entries) {
        if (![domain,`.`+domain,`www.${domain}`,`.www.${domain}`].includes(entry.domain)) continue;
        if (entry.partitionKey || entry.firstPartyDomain) throw new Error("This browser partition/container is not supported yet. Use the normal signed-in profile.");
        const {name,value,domain:cookieDomain,path,secure,httpOnly,hostOnly,expirationDate,sameSite} = entry;
        cookies.push({name,value,domain:cookieDomain,path,secure,httpOnly,hostOnly,expirationDate,sameSite});
      }
    }
    const response = await send({protocol_version:1,command:"authorize",nonce:pending.nonce,source:pending.source,browser:pending.browser,cookies,user_agent:navigator.userAgent});
    if (!response?.ok) throw new Error(response?.message || "The connection request expired. Start again in SavedDesk.");
    status.textContent = response.message || "Permission received. Check the account verification result in SavedDesk.";
    approved = {source:pending.source,browser:pending.browser,deadline:Date.now()+70000};
    pending = null;
    statusTimer = setTimeout(verificationStatus, 1000);
  } catch (error) { status.textContent = (error.message || "Connection failed.") + " You can retry approval or start Connect in SavedDesk and choose Check connection again."; }
  finally { approve.disabled = !pending; check.disabled = false; pair.disabled = false; forget.disabled = false; }
});
async function initialize() {
  try {
    if (api.storage.local.setAccessLevel) await api.storage.local.setAccessLevel({accessLevel:"TRUSTED_CONTEXTS"});
    const saved=await api.storage.local.get("pairingCode");
    if (saved.pairingCode) pairing=parsePairing(saved.pairingCode);
    pair.disabled=false; forget.disabled=false;
    await request();
  } catch (error) {pair.disabled=false;forget.disabled=false;status.textContent=connectionHelp(error);}
}
initialize();
