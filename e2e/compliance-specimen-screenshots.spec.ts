import { test } from "@playwright/test";

test.describe("compliance specimen screenshots", () => {
  test("360px upload section", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/compliance-specimen");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "/opt/cursor/artifacts/compliance-upload-360px.png",
      fullPage: true,
    });
  });

  test("desktop scan review", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/compliance-specimen");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "/opt/cursor/artifacts/compliance-scan-review-desktop.png",
      fullPage: true,
    });
  });
});
