/* No content scripts, external messages, session storage, analytics, or logging. */
const api = globalThis.browser ?? chrome;
const host = "com.saveddesk.connector";
const approve = document.querySelector("#approve");
const status = document.querySelector("#status");
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
  if (/native messaging host|host.*not found|host.*forbidden/i.test(message)) {
    return "SavedDesk's browser connection is unavailable. In SavedDesk select this browser, run Set up connector and open its folder, then click Connect. Return here and choose Check connection again. " + message;
  }
  return message + " Start Connect in SavedDesk, then choose Check connection again.";
}
async function request() {
  if (approved) { await verificationStatus(); return; }
  pending = null;
  approve.disabled = true;
  check.disabled = true;
  scope.textContent = "Checking the request from SavedDesk...";
  status.textContent = "Checking the desktop request...";
  try {
    const requested = await api.runtime.sendNativeMessage(host, { protocol_version: 1, command: "request" });
    if (!requested?.ok || !["instagram","x","youtube","facebook","tiktok","pinterest"].includes(requested.source)) throw new Error(requested?.message || "No connection request is waiting.");
    const browser = await provider();
    if ((browser === "firefox" || browser === "edge" || browser === "brave") && requested.browser !== browser) throw new Error("Select this browser on the Accounts screen and start the connection again.");
    if (browser === "chromium-family" && !["chrome","chromium","vivaldi"].includes(requested.browser)) throw new Error("Select this browser on the Accounts screen and start the connection again.");
    pending = requested;
    scope.textContent = `SavedDesk is requesting your ${({x:"X",instagram:"Instagram",youtube:"YouTube",facebook:"Facebook",tiktok:"TikTok",pinterest:"Pinterest"}[pending.source])} account from this ${pending.browser} profile.`;
    approve.textContent = `Approve ${({x:"X",instagram:"Instagram",youtube:"YouTube",facebook:"Facebook",tiktok:"TikTok",pinterest:"Pinterest"}[pending.source])} connection`;
    approve.disabled = false;
    status.textContent = "Make sure you are signed in to the intended account in this profile.";
  } catch (error) { status.textContent = connectionHelp(error); }
  finally { check.disabled = false; }
}
async function verificationStatus() {
  if (!approved) return;
  clearTimeout(statusTimer);
  try {
    const result = await api.runtime.sendNativeMessage(host, {protocol_version:1,command:"connection_status",source:approved.source,browser:approved.browser});
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
    const response = await api.runtime.sendNativeMessage(host, {protocol_version:1,command:"authorize",nonce:pending.nonce,source:pending.source,browser:pending.browser,cookies,user_agent:navigator.userAgent});
    if (!response?.ok) throw new Error(response?.message || "The connection request expired. Start again in SavedDesk.");
    status.textContent = response.message || "Permission received. Check the account verification result in SavedDesk.";
    approved = {source:pending.source,browser:pending.browser,deadline:Date.now()+70000};
    pending = null;
    statusTimer = setTimeout(verificationStatus, 1000);
  } catch (error) { status.textContent = (error.message || "Connection failed.") + " You can retry approval or start Connect in SavedDesk and choose Check connection again."; }
  finally { approve.disabled = !pending; check.disabled = false; }
});
request();
