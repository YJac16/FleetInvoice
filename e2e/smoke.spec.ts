import { test, expect } from "@playwright/test";

test.describe("smoke @smoke", () => {
  test("login page loads for unauthenticated users", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Sign in", { exact: true }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});

test.describe("authenticated flows", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to enable"
  );

  test("can sign in when E2E credentials are set", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.E2E_USER_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.E2E_USER_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  });
});
