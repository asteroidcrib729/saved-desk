// Exercise real native playlist preparation without contacting YouTube or using owner sessions.
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { randomUUID, createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "../..");
const data = resolve(root, ".cache/native-watch-later", randomUUID());
const exe = resolve(root, "desktop/src-tauri/target/debug/saveddesk.exe");
await mkdir(data, { recursive: true });
const version = JSON.parse(await readFile(resolve(root, "desktop/package.json"), "utf8")).version;
const port = await new Promise(done => {
 const server = createServer();
 server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => done(port)); });
});
const app = spawn(exe, [], { windowsHide: true, stdio: "ignore", env: {
 ...process.env, SAVEDDESK_TEST_DATA_DIR: data, SAVEDDESK_REQUIRE_PACKAGED_WORKER: "1",
 WEBVIEW2_USER_DATA_FOLDER: resolve(data, "webview"),
 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=" + port,
}});
let browser;
const checks = [];
try {
 for (let i = 0; i < 120; i++) {
  if (app.exitCode !== null) throw Error("Isolated native app exited.");
  try { await fetch("http://127.0.0.1:" + port + "/json/version"); break; }
  catch { await new Promise(done => setTimeout(done, 250)); }
 }
 browser = await chromium.connectOverCDP("http://127.0.0.1:" + port);
 const page = browser.contexts()[0].pages()[0];
 const errors = [];
 page.on("pageerror", error => errors.push(error.message));
 await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
 const prepare = id => page.evaluate(request => window.__TAURI_INTERNALS__.invoke("prepare_download", { request }), {
  source: "youtube", target: "https://www.youtube.com/playlist?list=" + id,
  title: "Synthetic playlist", quality: "original", profile: "original",
 });
 async function rejection(id) {
  try { await prepare(id); } catch (error) { return String(error); }
  throw Error("Preparation unexpectedly succeeded.");
 }
 for (const id of ["WL", "LL"]) expect(await rejection(id)).toContain("approved YouTube browser session");
 checks.push("WL and LL receive actionable browser approval errors without a session");
 expect(await rejection("WA")).toContain("full supported");
 checks.push("unknown short playlist IDs remain rejected");
 expect((await prepare("PL123456789012")).collection).toBe(true);
 checks.push("ordinary public playlists still prepare without authentication");
 const python = spawnSync(resolve(root, ".venv/Scripts/python.exe"), ["-"], {
  cwd: root, windowsHide: true, encoding: "utf8",
  env: { ...process.env, SAVEDDESK_FIXTURE_DATA: data },
  input: [
   "import os, sys, sqlite3, json",
   "from pathlib import Path",
   "sys.path.insert(0, str(Path.cwd()/'backend/src'))",
   "from social_downloader.browser_sessions import approve_session",
   "cookies=[dict(name='SAPISID', value='synthetic-personal-playlist', domain='.youtube.com', path='/', secure=True)]",
   "identity=approve_session('youtube',cookies)['account_id']",
   "with sqlite3.connect(Path(os.environ['SAVEDDESK_FIXTURE_DATA'])/'prototype-catalog.db') as db:",
   " db.execute(\"INSERT INTO accounts(source,account_id,username,browser,state,message) VALUES(?,?,?,?,?,?)\", ('youtube',identity,'BrowserSession','chrome','session_ready',''))",
   "print(json.dumps(dict(account_id=identity,cookies=cookies)))",
  ].join("\n"),
 });
 if (python.status !== 0) throw Error("Synthetic catalog seeding failed.");
 const protectedSession = spawnSync("powershell.exe", ["-NoProfile", "-Command",
  "Add-Type -AssemblyName System.Security; $bytes=[Text.Encoding]::UTF8.GetBytes($env:SAVEDDESK_SYNTHETIC_SESSION); $protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [IO.File]::WriteAllBytes((Join-Path $env:SAVEDDESK_FIXTURE_DATA 'session-youtube.dpapi'),$protected)"
 ], { windowsHide: true, encoding: "utf8", env: {
  ...process.env, SAVEDDESK_FIXTURE_DATA: data, SAVEDDESK_SYNTHETIC_SESSION: python.stdout.trim(),
 }});
 if (protectedSession.status !== 0) throw Error("Synthetic protected session seeding failed.");
 for (const id of ["WL", "LL"]) {
  const result = await prepare(id);
  expect(result.collection).toBe(true);
  expect(result.existing).toBe(0);
  expect(result.token).toMatch(/^[a-f0-9-]{36}$/);
 }
 checks.push("real native WL and LL preparation accepts scoped DPAPI browser approval");
 expect(errors).toEqual([]);
 const result = { passed: true, version, checks, app_sha256: createHash("sha256").update(await readFile(exe)).digest("hex"), live_youtube_requests: 0, owner_sessions_used: false, data };
 await writeFile(resolve(data, "result.json"), JSON.stringify(result, null, 2));
 console.log(JSON.stringify(result, null, 2));
} finally {
 if (browser) await browser.close();
 if (app.pid && app.exitCode === null) {
  spawnSync("taskkill.exe", ["/PID", String(app.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  await new Promise(done => app.exitCode !== null ? done() : app.once("exit", done));
 }
}
