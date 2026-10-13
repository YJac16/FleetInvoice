import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("date range chips @ mobile", () => {
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

  function tripCountStatusLabel(page: Page) {
    return page.locator("p.text-xs.text-muted-foreground").first();
  }

  async function waitForRangeQueryIdle(page: Page) {
    const updating = page.getByText("Updating…");
    const label = tripCountStatusLabel(page);

    await expect(label).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const updatingVisible = await updating.isVisible().catch(() => false);
          if (updatingVisible) return false;
          const text = (await label.textContent()) ?? "";
          return /\d+\s+trips?/.test(text);
        },
        { timeout: 30_000 }
      )
      .toBe(true);
  }

  async function readTripCountLabel(page: Page) {
    await waitForRangeQueryIdle(page);
    const label = tripCountStatusLabel(page);
    const text = (await label.textContent()) ?? "";
    const match = text.match(/\d+\s+trips?/);
    return { text, countSnippet: match?.[0] ?? null };
  }

  test("@390px chip updates UI and preserves scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/trips?range=this_week", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("group", { name: "Filter by date range" })
    ).toBeVisible({ timeout: 30_000 });

    const beforeCount = await readTripCountLabel(page);
    expect(beforeCount.countSnippet).toBeTruthy();

    const scrollY = await page.evaluate(() => {
      document.documentElement.style.minHeight = "2400px";
      document.body.style.minHeight = "2400px";
      window.scrollTo(0, 400);
      return window.scrollY;
    });
    expect(scrollY).toBeGreaterThanOrEqual(350);

    const lastWeekChip = page.getByRole("button", { name: "Last week", exact: true });
    await lastWeekChip.click();
    await expect(page).toHaveURL(/range=last_week/, { timeout: 10_000 });
    await expect(lastWeekChip).toHaveAttribute("aria-pressed", "true");

    const afterCount = await readTripCountLabel(page);
    expect(afterCount.countSnippet).toBeTruthy();
    expect(afterCount.text).not.toBe(beforeCount.text);

    const rowCards = page.locator("table tbody tr, .space-y-3 > div.rounded-2xl");
    await expect(rowCards.first().or(page.getByText(/No trips in this range/i)))
      .toBeVisible({ timeout: 30_000 });

    const afterScroll = await page.evaluate(() => window.scrollY);
    expect(Math.abs(afterScroll - scrollY)).toBeLessThan(80);
  });

  test("@412px chip updates UI and preserves scroll", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 844 });
    await page.goto("/trips?range=this_week", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("group", { name: "Filter by date range" })
    ).toBeVisible({ timeout: 30_000 });

    const beforeCount = await readTripCountLabel(page);
    expect(beforeCount.countSnippet).toBeTruthy();

    const scrollY = await page.evaluate(() => {
      document.documentElement.style.minHeight = "2400px";
      document.body.style.minHeight = "2400px";
      window.scrollTo(0, 400);
      return window.scrollY;
    });
    expect(scrollY).toBeGreaterThanOrEqual(350);

    const yesterdayChip = page.getByRole("button", { name: "Yesterday", exact: true });
    await yesterdayChip.click();
    await expect(page).toHaveURL(/range=yesterday/, { timeout: 10_000 });
    await expect(yesterdayChip).toHaveAttribute("aria-pressed", "true");

    const afterCount = await readTripCountLabel(page);
    expect(afterCount.countSnippet).toBeTruthy();
    expect(afterCount.text).not.toBe(beforeCount.text);

    await expect(
      page.locator("table tbody tr, .space-y-3 > div.rounded-2xl").first().or(
        page.getByText(/No trips in this range/i)
      )
    ).toBeVisible({ timeout: 30_000 });

    const afterScroll = await page.evaluate(() => window.scrollY);
    expect(Math.abs(afterScroll - scrollY)).toBeLessThan(80);
  });
});
