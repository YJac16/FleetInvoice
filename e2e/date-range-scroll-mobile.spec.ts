import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("date range chips preserve scroll @390px", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to enable"
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(process.env.E2E_USER_EMAIL!);
    await page.locator('input[name="password"]').fill(process.env.E2E_USER_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(hub|dashboard|driver|employee|company|trips|awaiting-invite)/, {
      timeout: 30_000,
    });
  });

  test("trips chip tap does not jump to top", async ({ page }) => {
    await page.goto("/trips?range=this_week", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("group", { name: "Filter by date range" })
    ).toBeVisible({ timeout: 30_000 });

    const scrollY = await page.evaluate(() => {
      document.documentElement.style.minHeight = "2400px";
      document.body.style.minHeight = "2400px";
      window.scrollTo(0, 400);
      return window.scrollY;
    });
    expect(scrollY).toBeGreaterThanOrEqual(350);

    await page.getByRole("button", { name: "Last week", exact: true }).click();
    await expect(page).toHaveURL(/range=last_week/, { timeout: 10_000 });

    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - scrollY)).toBeLessThan(80);
  });
});

test.describe("date range chips preserve scroll @412px", () => {
  test.use({ viewport: { width: 412, height: 844 } });

  test.skip(
    !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to enable"
  );

  test("trips chip tap does not jump to top", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(process.env.E2E_USER_EMAIL!);
    await page.locator('input[name="password"]').fill(process.env.E2E_USER_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(hub|dashboard|driver|employee|company|trips|awaiting-invite)/, {
      timeout: 30_000,
    });

    await page.goto("/trips?range=this_week", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("group", { name: "Filter by date range" })
    ).toBeVisible({ timeout: 30_000 });

    const scrollY = await page.evaluate(() => {
      document.documentElement.style.minHeight = "2400px";
      document.body.style.minHeight = "2400px";
      window.scrollTo(0, 400);
      return window.scrollY;
    });
    expect(scrollY).toBeGreaterThanOrEqual(350);

    await page.getByRole("button", { name: "Yesterday", exact: true }).click();
    await expect(page).toHaveURL(/range=yesterday/, { timeout: 10_000 });

    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - scrollY)).toBeLessThan(80);
  });
});
