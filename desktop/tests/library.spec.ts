import { expect, test } from "@playwright/test";

test("offline static shell, sample results, search, and repeat cancellation", async ({ page }) => {
  const external: string[] = [];
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4173")) external.push(request.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Try sample collection" }).click();
  await expect(page.getByTestId("library-list").locator("article")).toHaveCount(3);
  await page.getByTestId("library-list").locator("article").first().getByRole("button", {name:"View saved files"}).click();
  await expect(page.getByRole("dialog")).toContainText("sample records only");
  await page.getByRole("button", {name:"Close",exact:true}).click();
  await page.getByRole("button", { name: "Downloads", exact: true }).click();
  await expect(page.getByText("3 saved · 0 already available · 0 failed")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Run local test job" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Downloads", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("textbox", { name: "Search your library" }).fill("weekend");
  await expect(page.getByTestId("library-list").locator("article")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  expect(external).toEqual([]);
});

test("new-only reuse and explicit repeat preserve logical item count", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try sample collection" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Run local test job" }).click();
  await page.getByRole("button", { name: "Download new items", exact: true }).click();
  await page.getByRole("button", { name: "Downloads", exact: true }).click();
  await expect(page.getByText("0 saved · 3 already available · 0 failed")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Run local test job" }).click();
  await page.getByRole("button", { name: "Download everything again", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByTestId("library-list").locator("article")).toHaveCount(3);
});

test("compact layout, keyboard search, and browser preview keeps account access native", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 520 });
  await page.goto("/");
  // Static markup can arrive before React installs keyboard handlers.
  await expect(page.locator(".sidebar-toggle")).toBeEnabled();
  await page.keyboard.press("Control+f");
  await expect(page.getByRole("textbox", { name: "Search your library" })).toBeFocused();
  await page.keyboard.press("Control+n");
  await expect(page.getByRole("dialog")).toContainText("Real downloads are available in the Windows desktop app");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("account setup explains platform scope without credential entry fields", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button",{name:"Accounts",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Browser",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Connect using this browser"})).toHaveCount(6);
  await expect(page.getByRole("button",{name:"Connect using this browser"}).first()).toBeDisabled();
  await page.getByText("First time? Set up the browser connector").click();
  await expect(page.getByText("Access is limited to the platform you approve",{exact:false})).toBeVisible();
  expect(await page.locator('input[type="password"],input[type="file"]').count()).toBe(0);
});
