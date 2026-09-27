import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ARTIFACTS = "/opt/cursor/artifacts";
const SCREENSHOTS = join(ARTIFACTS, "screenshots");

test.use({ viewport: { width: 390, height: 844 } });

test.beforeAll(() => {
  mkdirSync(SCREENSHOTS, { recursive: true });
});

test.describe("admin capture @390px", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "Set E2E_USER_EMAIL and E2E_USER_PASSWORD for admin capture e2e"
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(process.env.E2E_USER_EMAIL!);
    await page.locator('input[name="password"]').fill(process.env.E2E_USER_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(hub|dashboard|driver|employee|company|awaiting-invite)/, {
      timeout: 30_000,
    });
  });

  test("driver capture shows document controls after save", async ({ page }) => {
    await page.goto("/drivers/capture", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /new driver capture/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({
      path: join(SCREENSHOTS, "e2e-driver-capture-390-before-save.png"),
      fullPage: true,
    });

    const specimen = `E2E Specimen ${Date.now()}`;
    await page.getByLabel(/full name/i).fill(specimen);
    await page.getByRole("button", { name: /create driver/i }).click();

    await expect(page.getByText(/licence document/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/photo or upload/i).first()).toBeVisible();
    await page.screenshot({
      path: join(SCREENSHOTS, "e2e-driver-capture-390-post-save-documents.png"),
      fullPage: true,
    });
  });

  test("vehicle capture shows document controls after save", async ({ page }) => {
    await page.goto("/vehicles/capture", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /new vehicle capture/i })).toBeVisible({
      timeout: 30_000,
    });

    const specimen = `E2E Van ${Date.now()}`;
    await page.getByLabel(/display name/i).fill(specimen);
    await page.screenshot({
      path: join(SCREENSHOTS, "e2e-vehicle-capture-390-before-save.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: /create vehicle/i }).click();
    await expect(page).toHaveURL(/\/vehicles\/[^/]+\/capture/, { timeout: 30_000 });

    await expect(page.getByText(/licence disc document/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /take photo/i }).first()).toBeVisible();
    await page.screenshot({
      path: join(SCREENSHOTS, "e2e-vehicle-capture-390-post-save-documents.png"),
      fullPage: true,
    });
  });
});

test.describe("driver blocked from admin capture @390px", () => {
  test.skip(
    !process.env.E2E_DRIVER_EMAIL ||
      !process.env.E2E_DRIVER_PASSWORD ||
      !process.env.E2E_USER_EMAIL,
    "Set E2E_DRIVER_EMAIL, E2E_DRIVER_PASSWORD (and E2E_USER_EMAIL) for driver denial e2e"
  );

  test("driver role cannot open admin capture routes", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(process.env.E2E_DRIVER_EMAIL!);
    await page.locator('input[name="password"]').fill(process.env.E2E_DRIVER_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(hub|dashboard|driver|employee|company|awaiting-invite)/, {
      timeout: 30_000,
    });

    await page.goto("/drivers/capture", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/driver(\/|$)/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/drivers\/capture/);

    await page.goto("/vehicles/capture", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/driver(\/|$)/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/vehicles\/capture/);
    await page.screenshot({
      path: join(SCREENSHOTS, "e2e-driver-denied-admin-capture-390.png"),
      fullPage: true,
    });
  });
});
