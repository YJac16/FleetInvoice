import { test, expect } from "@playwright/test";

test.describe("smoke @smoke", () => {
  test("404 page is a product empty state", async ({ page }) => {
    // /auth/* is public, so signed-out users actually see not-found
    // instead of the login redirect used on app routes.
    await page.goto("/auth/not-a-page", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("This stop isn't on the route.")).toBeVisible();
    await expect(
      page.getByText("The URL may be wrong, or you don't have access.")
    ).toBeVisible();
    const hub = page.getByRole("link", { name: "Go to hub" });
    await expect(hub).toBeVisible();
    await expect(hub).toHaveAttribute("href", "/login");
    const trips = page.getByRole("link", { name: "View trips" });
    await expect(trips).toBeVisible();
    await expect(trips).toHaveAttribute("href", "/trips");
  });

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
