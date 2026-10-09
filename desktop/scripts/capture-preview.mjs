import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(import.meta.dirname, "../../.cache/saveddesk-preview.png");
await mkdir(resolve(import.meta.dirname, "../../.cache"), { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.goto("http://127.0.0.1:4173");
  await page.getByRole("button", { name: "Try sample collection" }).click();
  await page.getByTestId("library-list").waitFor();
  await page.screenshot({ path: output, fullPage: true });
  process.stdout.write(output + "\n");
} finally { await browser.close(); }
