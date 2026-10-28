import { createHmac, randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const fixtureToken="a".repeat(64);
const code = await readFile(new URL("./popup.js", import.meta.url), "utf8");
async function popup({ unpaired=false, fakeApp=false, firefox = false, store = "0", permit = true, selected = "edge", source = "instagram", userAgent, probeFailure = false, noRequest = false, requestFailures = 0, rejectApproval = false, verification = { ok:true,state:"connected",username:"fixture_user",message:"" } } = {}) {
  const elements = new Map();
  const calls = [];
  const timers = new Map();
  let timerId=0;
  const selector = name => {
    if (!elements.has(name)) elements.set(name, { disabled: true, textContent: "", value:"", addEventListener: (_, callback) => { elements.get(name).click = callback; } });
    return elements.get(name);
  };
  const api = {
    runtime: {
      getManifest: () => ({version:"0.2.11"}),
      ...(firefox ? { getBrowserInfo: () => ({ name: "Firefox" }) } : {}),
      fixtureRequest: async (host, message) => {
        calls.push({ type: "native", host, message });
        if (message.command === "connector_probe") return probeFailure?{ok:false,message:"Update or reload the extension."}:{ok:true,ready:true};
        if (message.command === "connection_status") return verification;
        if (message.command === "request") {
          if(noRequest)return {ok:false,message:"No connection request is waiting."};
          if (requestFailures-- > 0) throw new Error("Error when communicating with the native messaging host.");
          return { ok: true, source, browser: selected, nonce: "test-nonce" };
        }
        return rejectApproval ? { ok: false, message: "The connection request expired." } : { ok: true, message: "Verifying account" };
      },
    },
    storage:{local:{get:async()=>unpaired?{}:({pairingCode:"SD1.41000."+selected+"."+fixtureToken}),set:async value=>calls.push({type:"store",value}),remove:async key=>calls.push({type:"forget",key})}},
    permissions: { request: async value => { calls.push({ type: "permission", value }); return permit; } },
    tabs: { query: async () => [{ id: 7 }] },
    cookies: {
      getAllCookieStores: async () => [{ id: store, tabIds: [7] }],
      getAll: async value => {
        calls.push({ type: "cookies", value });
        return [{ name: source === "x" ? "auth_token" : "sessionid", value: "synthetic-private-session", domain: source === "x" ? ".x.com" : `.${source}.com`, path: "/", httpOnly: true, secure: true },
                { name: "unrelated", value: "unrelated-secret", domain: ".unrelated.test", path: "/" }];
      },
    },
  };
  runInNewContext(code, { fetch:async(url,options)=>{
    assert.equal(url,"http://127.0.0.1:41000/connector");
    const [prefix,authorization]=options.headers.Authorization.split(" ");
    const [browser,nonce,signature]=authorization.split(".");
    assert.equal(prefix,"SavedDesk");
    assert.equal(browser,selected);
    assert.equal(signature,createHmac("sha256",fixtureToken).update(nonce+"\n"+options.body).digest("hex"));
    assert.equal(options.headers.Authorization.includes(fixtureToken),false);
    assert.equal(options.redirect,"error");
    assert.equal(options.credentials,"omit");
    const request=JSON.parse(options.body);
    const response=JSON.stringify(await api.runtime.fixtureRequest(url,request));
    const proof=fakeApp&&request.command==="request"?"0".repeat(64):createHmac("sha256",fixtureToken).update(nonce+"\n"+response).digest("hex");
    return {ok:true,text:async()=>response,headers:{get:()=>proof}};
  },TextEncoder,crypto:{randomUUID,subtle:{
    importKey:async(_,key)=>key,
    sign:async(_,key,data)=>createHmac("sha256",key).update(data).digest(),
    verify:async(_,key,signature,data)=>Buffer.from(signature).equals(createHmac("sha256",key).update(data).digest()),
  }},AbortSignal:{timeout:()=>undefined}, chrome: api, ...(firefox ? { browser: api } : {}), navigator: { userAgent: userAgent ?? (firefox ? "Firefox" : "Edg/") }, document: { querySelector: selector }, setTimeout: callback => { timers.set(++timerId,callback);return timerId; }, clearTimeout: id => timers.delete(id) });
  // Initial request/provider uses asynchronous browser APIs.
  await new Promise(done => setImmediate(done));
  return { calls, elements, click: () => selector("#approve").click(), poll: async () => { const [id,callback]=timers.entries().next().value;timers.delete(id);await callback(); } };
}

test("approval requests one platform and sends scoped sessions only through authenticated loopback", async () => {
  const view = await popup();
  assert.equal(view.elements.get("#approve").disabled, false);
  await view.click();
  const approval = view.calls.find(c => c.type === "native" && c.message.command === "authorize");
  assert.equal(approval.host, "http://127.0.0.1:41000/connector");
  assert.equal(approval.message.cookies.length, 1);
  assert.equal(approval.message.cookies[0].name, "sessionid");
  assert.equal(approval.message.nonce, "test-nonce");
  assert.equal(JSON.stringify(view.calls.find(c => c.type === "permission").value), '{"origins":["https://*.instagram.com/*"]}');
  for (const element of view.elements.values()) assert.equal(element.textContent.includes("synthetic-private-session"), false);
});

test("permission denial reads no cookies and transfers no session", async () => {
  const view = await popup({ permit: false });
  await view.click();
  assert.equal(view.calls.some(c => c.type === "cookies" || c.message?.command === "authorize"), false);
  assert.match(view.elements.get("#status").textContent, /declined/);
  assert.equal(view.elements.get("#approve").disabled, false);
  assert.equal(view.elements.get("#check").disabled, false);
});

test("Firefox container sessions are rejected before reading cookies", async () => {
  const view = await popup({ firefox: true, store: "firefox-container-1", selected: "firefox" });
  await view.click();
  assert.equal(view.calls.some(c => c.type === "cookies" || c.message?.command === "authorize"), false);
  assert.match(view.elements.get("#status").textContent, /containers/);
});

test("a different browser cannot approve the pending provider", async () => {
  const view = await popup({ selected: "chrome" });
  assert.equal(view.elements.get("#approve").disabled, true);
  assert.match(view.elements.get("#status").textContent, /Select this browser/);
});


test("Chrome can approve Instagram and X using only the selected platform scopes", async () => {
  for (const source of ["instagram", "x"]) {
    const view = await popup({ selected: "chrome", userAgent: "Chrome/154", source });
    assert.equal(view.elements.get("#approve").disabled, false);
    assert.equal(view.calls.some(c => c.type === "cookies"), false);
    await view.click();
    const approval = view.calls.find(c => c.message?.command === "authorize");
    assert.equal(approval.message.source, source);
    assert.equal(approval.message.browser, "chrome");
    assert.equal(approval.message.user_agent, "Chrome/154");
    assert.equal(approval.message.cookies[0].name, source === "x" ? "auth_token" : "sessionid");
    assert.equal(view.elements.get("#approve").disabled, true);
    assert.equal(view.elements.get("#check").disabled, false);
  }
});

test("a failed host check gives repair instructions and can be checked again", async () => {
  const view = await popup({ selected: "chrome", userAgent: "Chrome/154", requestFailures: 1 });
  assert.equal(view.elements.get("#approve").disabled, true);
  assert.equal(view.elements.get("#check").disabled, false);
  assert.match(view.elements.get("#status").textContent, /Pair the updated extension/);
  assert.equal(view.calls.some(c => c.type === "cookies"), false);
  await view.elements.get("#check").click();
  assert.equal(view.elements.get("#approve").disabled, false);
  await view.click();
  assert.equal(view.calls.filter(c => c.message?.command === "authorize").length, 1);
});

test("rejected desktop approval does not strand the user with disabled controls", async () => {
  const view = await popup({ rejectApproval: true });
  await view.click();
  assert.match(view.elements.get("#status").textContent, /expired/);
  assert.equal(view.elements.get("#approve").disabled, false);
  assert.equal(view.elements.get("#check").disabled, false);
});


test("permission receipt is followed by the final verified account result", async () => {
  const view=await popup();await view.click();await view.poll();
  assert.match(view.elements.get("#status").textContent,/Connected as @fixture_user/);
  assert.equal(view.calls.filter(c=>c.message?.command==="authorize").length,1);
  assert.equal(view.calls.filter(c=>c.message?.command==="connection_status").length,1);
});

test("failed verification replaces permission receipt with the actual safe error", async () => {
  const view=await popup({verification:{ok:true,state:"sign_in_needed",username:"",message:"Instagram rejected account verification (HTTP 400)."}});
  await view.click();await view.poll();
  assert.match(view.elements.get("#status").textContent,/not connected.*HTTP 400/);
  assert.equal(view.elements.get("#check").disabled,false);
});

test("checking an approved pending result never re-reads or resends cookies", async () => {
  const view=await popup({verification:{ok:true,state:"connecting",username:"",message:""}});
  await view.click();await view.elements.get("#check").click();
  assert.match(view.elements.get("#status").textContent,/not connected yet/);
  assert.equal(view.calls.filter(c=>c.type==="cookies").length,1);
  assert.equal(view.calls.filter(c=>c.message?.command==="authorize").length,1);
});

test("new browser platforms request only their own origin and never claim verified identity",async()=>{
  for(const source of ["youtube","facebook","tiktok","pinterest"]){
    const view=await popup({source,verification:{ok:true,state:"session_ready",username:"BrowserSession",message:""}});
    assert.equal(view.elements.get("#approve").disabled,false);await view.click();
    assert.deepEqual(JSON.parse(JSON.stringify(view.calls.find(c=>c.type==="permission").value)),{origins:[`https://*.${source}.com/*`]});
    const approval=view.calls.find(c=>c.type==="native"&&c.message.command==="authorize");
    assert.equal(approval.message.cookies.length,1);assert.equal(approval.message.cookies[0].domain,`.${source}.com`);
    assert.equal(approval.message.cookies.some(c=>c.domain.includes("google.com")),false);
    await view.poll();assert.match(view.elements.get("#status").textContent,/Browser session approved/);
    assert.doesNotMatch(view.elements.get("#status").textContent,/Connected as/);
  }
});
test("unsupported private-app providers cannot request browser-session approval",async()=>{
  for(const source of ["reddit","discord","unsupported"]){const view=await popup({source});assert.equal(view.elements.get("#approve").disabled,true);assert.equal(view.calls.some(c=>c.type==="cookies"),false);}
});

test("extension check succeeds without an account request or cookie access",async()=>{
 const view=await popup({noRequest:true});
 assert.match(view.elements.get("#status").textContent,/Return to SavedDesk/);
 assert.equal(view.elements.get("#approve").disabled,true);
 assert.equal(view.calls.some(c=>c.type==="permission"||c.type==="cookies"),false);
 assert.equal(view.calls.find(c=>c.message?.command==="connector_probe").message.extension_version,"0.2.11");
});
test("failed extension handshake reads no cookies and requests no account approval",async()=>{
 const view=await popup({probeFailure:true});
 assert.match(view.elements.get("#status").textContent,/Update or reload/);
 assert.equal(view.elements.get("#approve").disabled,true);
 assert.equal(view.calls.some(c=>c.message?.command==="request"||c.type==="cookies"),false);
});

test("unpaired extensions cannot fetch requests or read cookies",async()=>{
 const view=await popup({unpaired:true});
 assert.equal(view.calls.length,0);
 assert.match(view.elements.get("#status").textContent,/Pair this extension/);
 assert.equal(view.elements.get("#approve").disabled,true);
});
test("pairing rejects arbitrary URLs before permission or network access",async()=>{
 const view=await popup({unpaired:true});
 view.elements.get("#pairing-code").value="https://attacker.test/code";
 await view.elements.get("#pair").click();
 assert.equal(view.calls.length,0);
 assert.match(view.elements.get("#status").textContent,/Paste the private pairing code/);
});
test("declining loopback permission does not persist pairing or read cookies",async()=>{
 const view=await popup({unpaired:true,permit:false});
 view.elements.get("#pairing-code").value="SD1.41000.edge."+fixtureToken;
 await view.elements.get("#pair").click();
 assert.equal(view.calls.length,1);
 assert.equal(JSON.stringify(view.calls[0].value),'{"origins":["http://127.0.0.1/*"]}');
 assert.match(view.elements.get("#status").textContent,/declined/);
});
test("pairing persists only its code after a successful probe and forgetting disables access",async()=>{
 const view=await popup({unpaired:true});
 view.elements.get("#pairing-code").value="SD1.41000.edge."+fixtureToken;
 await view.elements.get("#pair").click();
 const persisted=view.calls.find(c=>c.type==="store");
 assert.equal(JSON.stringify(persisted.value),JSON.stringify({pairingCode:"SD1.41000.edge."+fixtureToken}));
 assert.equal(view.calls.some(c=>c.type==="cookies"),false);
 await view.elements.get("#forget").click();
 assert.equal(view.elements.get("#approve").disabled,true);
 const count=view.calls.length;
 await view.elements.get("#check").click();
 assert.equal(view.calls.length,count);
});
test("an unsuccessful handshake never saves a pairing code",async()=>{
 const view=await popup({unpaired:true,probeFailure:true});
 view.elements.get("#pairing-code").value="SD1.41000.edge."+fixtureToken;
 await view.elements.get("#pair").click();
 assert.equal(view.calls.some(c=>c.type==="store"||c.type==="cookies"),false);
});

test("an impersonating local process cannot supply a trusted account request",async()=>{
 const view=await popup({fakeApp:true});
 assert.equal(view.elements.get("#approve").disabled,true);
 assert.equal(view.calls.some(c=>c.type==="cookies"||c.type==="permission"),false);
 assert.match(view.elements.get("#status").textContent,/could not prove its identity/);
});
