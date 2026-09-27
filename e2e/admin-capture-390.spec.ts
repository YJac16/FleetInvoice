import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("admin capture @390px", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "Set E2E_USER_EMAIL and E2E_USER_PASSWORD for admin capture e2e"
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.E2E_USER_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.E2E_USER_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  });

  test("driver capture shows document controls after save", async ({ page }) => {
    await page.goto("/drivers/capture", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /new driver capture/i })).toBeVisible({
      timeout: 30_000,
    });

    const specimen = `E2E Specimen ${Date.now()}`;
    await page.getByLabel(/full name/i).fill(specimen);
    await page.getByRole("button", { name: /create driver/i }).click();

    await expect(page.getByText(/licence document/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/photo or upload/i).first()).toBeVisible();
  });

  test("vehicle capture shows document controls after save", async ({ page }) => {
    await page.goto("/vehicles/capture", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /new vehicle capture/i })).toBeVisible({
      timeout: 30_000,
    });

    const specimen = `E2E Van ${Date.now()}`;
    await page.getByLabel(/^name$/i).fill(specimen);
    await page.getByRole("button", { name: /create vehicle/i }).click();

    await expect(page.getByText(/license disc|licence disc/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/photo or upload/i).first()).toBeVisible();
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
    await page.getByLabel(/email/i).fill(process.env.E2E_DRIVER_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.E2E_DRIVER_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

    await page.goto("/drivers/capture", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/access denied/i)).toBeVisible({ timeout: 30_000 });

    await page.goto("/vehicles/capture", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/access denied/i)).toBeVisible({ timeout: 30_000 });
  });
});
