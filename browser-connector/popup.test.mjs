import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const code = await readFile(new URL("./popup.js", import.meta.url), "utf8");
async function popup({ firefox = false, store = "0", permit = true, selected = "edge", source = "instagram", userAgent, requestFailures = 0, rejectApproval = false, verification = { ok:true,state:"connected",username:"fixture_user",message:"" } } = {}) {
  const elements = new Map();
  const calls = [];
  const timers = new Map();
  let timerId=0;
  const selector = name => {
    if (!elements.has(name)) elements.set(name, { disabled: true, textContent: "", addEventListener: (_, callback) => { elements.get(name).click = callback; } });
    return elements.get(name);
  };
  const api = {
    runtime: {
      ...(firefox ? { getBrowserInfo: () => ({ name: "Firefox" }) } : {}),
      sendNativeMessage: async (host, message) => {
        calls.push({ type: "native", host, message });
        if (message.command === "connection_status") return verification;
        if (message.command === "request") {
          if (requestFailures-- > 0) throw new Error("Error when communicating with the native messaging host.");
          return { ok: true, source, browser: selected, nonce: "test-nonce" };
        }
        return rejectApproval ? { ok: false, message: "The connection request expired." } : { ok: true, message: "Verifying account" };
      },
    },
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
  runInNewContext(code, { chrome: api, ...(firefox ? { browser: api } : {}), navigator: { userAgent: userAgent ?? (firefox ? "Firefox" : "Edg/") }, document: { querySelector: selector }, setTimeout: callback => { timers.set(++timerId,callback);return timerId; }, clearTimeout: id => timers.delete(id) });
  // Initial request/provider uses asynchronous browser APIs.
  await new Promise(done => setImmediate(done));
  return { calls, elements, click: () => selector("#approve").click(), poll: async () => { const [id,callback]=timers.entries().next().value;timers.delete(id);await callback(); } };
}

test("approval requests one platform and sends scoped sessions only through native messaging", async () => {
  const view = await popup();
  assert.equal(view.elements.get("#approve").disabled, false);
  await view.click();
  const approval = view.calls.find(c => c.type === "native" && c.message.command === "authorize");
  assert.equal(approval.host, "com.saveddesk.connector");
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
  assert.match(view.elements.get("#status").textContent, /Set up connector/);
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
