// Real WebView2/native-command test, following playwright.dev/docs/webview2.
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";

const project = resolve(import.meta.dirname, "../..");
const data = resolve(project, ".cache/native-smoke", randomUUID());
await mkdir(data, { recursive: true });
const port = await new Promise(resolvePort => {
  const server = createServer();
  server.listen(0, "127.0.0.1", () => {
    const selected = server.address().port;
    server.close(() => resolvePort(selected));
  });
});
const processHandle = spawn(resolve(project, "desktop/src-tauri/target/debug/saveddesk.exe"), [], {
  windowsHide: true,
  env: { ...process.env, SAVEDDESK_TEST_DATA_DIR: data, SAVEDDESK_REQUIRE_PACKAGED_WORKER: "1",
    WEBVIEW2_USER_DATA_FOLDER: resolve(data, "webview"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
for (const stream of [processHandle.stdout, processHandle.stderr]) {
  stream.on("data", bytes => { output = (output + bytes.toString()).slice(-4000); });
}
let browser;
try {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (processHandle.exitCode !== null) throw new Error(`Native app exited early: ${output}`);
    try { await fetch(`http://127.0.0.1:${port}/json/version`); break; }
    catch { await new Promise(done => setTimeout(done, 250)); }
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  let page;
  for (let attempt = 0; attempt < 40; attempt++) {
    page = context.pages()[0];
    if (page) break;
    await new Promise(done => setTimeout(done, 100));
  }
  if (!page) throw new Error("Native window did not load.");
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await expect(page.locator(".preview-note")).toHaveCount(0);
  await page.getByRole("button", { name: "Try sample collection" }).click();
  await expect(page.locator('div[role="status"][aria-atomic="true"]')).toHaveText("Test job complete. Your sample library is ready.", { timeout: 25000 });
  await expect(page.getByTestId("library-list").locator("article")).toHaveCount(3);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Run local test job" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Downloads", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Run local test job" }).click();
  await page.getByRole("button", { name: "Download new items", exact: true }).click();
  await page.getByRole("button", { name: "Downloads", exact: true }).click();
  // The packaged worker can take more than Playwright's default five seconds to
  // finish startup. Wait for completion, rather than killing a successful job.
  await expect(page.locator('div[role="status"][aria-atomic="true"]')).toHaveText("No new sample items found. Existing files are available.", { timeout: 25000 });
  await expect(page.getByText("0 saved · 3 already available · 0 failed")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Run local test job" }).click();
  await page.getByRole("button", { name: "Download everything again", exact: true }).click();
  await page.getByRole("button", { name: "Downloads", exact: true }).click();
  await expect(page.locator(".job-card").filter({ hasText: "Another copy" })).toContainText("completed", { timeout: 25000 });
  await expect(page.locator(".job-card").filter({ hasText: "Another copy" })).toContainText("3 saved · 0 already available · 0 failed");
  await expect(page.locator(".job-card")).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await expect(page.getByTestId("library-list").locator("article")).toHaveCount(3);
  expect(errors).toEqual([]);
  await page.screenshot({ path: resolve(project, ".cache/saveddesk-native.png") });
  process.stdout.write(`Native WebView2 test passed: files, SQLite, skip/repeat, cancellation, reload. Test data: ${data}\n`);
} finally {
  if (browser) await browser.close();
  // Terminate only this owned app and its child tree. No global browser/process killing.
  if (processHandle.pid && processHandle.exitCode === null) {
    spawnSync("taskkill.exe", ["/PID", String(processHandle.pid), "/T", "/F"], { windowsHide: true });
  }
}
