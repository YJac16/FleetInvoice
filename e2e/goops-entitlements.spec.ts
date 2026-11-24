import { randomUUID } from "node:crypto";

import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * GoOps refocus step 7 — entitlement gates, end to end.
 *
 * LOCAL OR DEMO SUPABASE ONLY. Every test skips unless:
 *   - E2E_SUPABASE_URL is set and its host is localhost / 127.0.0.1 / ::1, or
 *     exactly equals E2E_DEMO_SUPABASE_HOST (explicit opt-in), and
 *   - the app baseURL host is local, or exactly equals E2E_DEMO_BASE_HOST.
 * The browser also aborts any request to a host other than the app and that
 * Supabase host, so a dev server secretly pointed at a hosted project fails
 * instead of touching it.
 *
 * The tests only read: sign in, navigate, one POST the billing guard denies
 * before any data access. The invite form is opened, never submitted.
 *
 * Fixture (local): node scripts/local-db/provision-e2e-goops-entitlements.mjs
 * prints the env vars below. The org's plan has core + gps only.
 *   E2E_ENT_PASSWORD, E2E_ENT_ORG_ID,
 *   E2E_ENT_ADMIN_EMAIL, E2E_ENT_COMPANY_EMAIL,
 *   E2E_ENT_EMPLOYEE_EMAIL, E2E_ENT_DRIVER_EMAIL
 *
 * The API test needs RESEND_API_KEY set on the dev server (any dummy value):
 * /api/invoices/send answers 503 before the guard without it. The key is never
 * used because the guard returns 403 first.
 *
 * Run: npm run test:e2e:entitlements
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const NO_ACCESS = /\/app\/no-access(\?|$)/;

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isAllowedHost(host: string | null, demoHost: string | undefined): boolean {
  if (!host) return false;
  if (LOCAL_HOSTS.has(host)) return true;
  return Boolean(demoHost) && host === demoHost;
}

const supabaseHost = hostOf(process.env.E2E_SUPABASE_URL);
const appHost = hostOf(BASE_URL);
const targetReason = !supabaseHost
  ? "Set E2E_SUPABASE_URL to a local (or explicitly allowed demo) Supabase URL"
  : !isAllowedHost(supabaseHost, process.env.E2E_DEMO_SUPABASE_HOST)
    ? `E2E_SUPABASE_URL host "${supabaseHost}" is not local or E2E_DEMO_SUPABASE_HOST`
    : !isAllowedHost(appHost, process.env.E2E_DEMO_BASE_HOST)
      ? `baseURL host "${appHost}" is not local or E2E_DEMO_BASE_HOST`
      : null;

const PASSWORD = process.env.E2E_ENT_PASSWORD;
const ORG_ID = process.env.E2E_ENT_ORG_ID;
const EMAIL = {
  admin: process.env.E2E_ENT_ADMIN_EMAIL,
  company: process.env.E2E_ENT_COMPANY_EMAIL,
  employee: process.env.E2E_ENT_EMPLOYEE_EMAIL,
  driver: process.env.E2E_ENT_DRIVER_EMAIL,
};

function skipUnless(...vars: Array<[string, string | undefined]>) {
  const missing = vars.filter(([, v]) => !v).map(([k]) => k);
  test.skip(missing.length > 0, `Set ${missing.join(", ")} to enable`);
}

/** Abort any browser request outside the app and the allowed Supabase host. */
async function lockNetwork(context: BrowserContext) {
  await context.route("**/*", (route) => {
    const host = hostOf(route.request().url());
    if (host && (host === appHost || host === supabaseHost)) return route.continue();
    if (route.request().url().startsWith("data:")) return route.continue();
    return route.abort("blockedbyclient");
  });
}

async function signIn(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test.describe("GoOps entitlements @entitlements", () => {
  test.skip(targetReason !== null, targetReason ?? "");
  skipUnless(["E2E_ENT_PASSWORD", PASSWORD]);

  test.beforeEach(async ({ context }) => {
    await lockNetwork(context);
  });

  test("company manager in an org without portal lands on /app/no-access", async ({ page }) => {
    skipUnless(["E2E_ENT_COMPANY_EMAIL", EMAIL.company]);
    await signIn(page, EMAIL.company!);
    await expect(page).toHaveURL(NO_ACCESS, { timeout: 30_000 });
    await expect(page.getByText("Not on your plan")).toBeVisible();
    // Own hub is the denied one: no link back into a redirect loop.
    await expect(page.getByRole("link", { name: "Back to home" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  test("employee in an org without passengers lands on /app/no-access", async ({ page }) => {
    skipUnless(["E2E_ENT_EMPLOYEE_EMAIL", EMAIL.employee]);
    await signIn(page, EMAIL.employee!);
    await expect(page).toHaveURL(NO_ACCESS, { timeout: 30_000 });
    await expect(page.getByText("Not on your plan")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to home" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  test("org admin on a plan without billing opening /invoices gets /app/no-access", async ({
    page,
  }) => {
    skipUnless(["E2E_ENT_ADMIN_EMAIL", EMAIL.admin]);
    await signIn(page, EMAIL.admin!);
    await page.goto("/invoices", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(NO_ACCESS, { timeout: 30_000 });
    await expect(page.getByText("Not on your plan")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
  });

  test("POST /api/invoices/send returns 403 module_not_entitled", async ({ page }) => {
    skipUnless(["E2E_ENT_ADMIN_EMAIL", EMAIL.admin], ["E2E_ENT_ORG_ID", ORG_ID]);
    await signIn(page, EMAIL.admin!);
    const res = await page.request.post("/api/invoices/send", {
      data: {
        organisationId: ORG_ID,
        invoiceId: randomUUID(),
        to: "nobody@example.test",
        printUrl: new URL("/x", BASE_URL).toString(),
      },
    });
    if (res.status() === 503) {
      const body = await res.text();
      test.skip(
        body.includes("Email delivery is not configured"),
        "Set RESEND_API_KEY to any dummy value on the dev server (the guard answers before it is used)"
      );
    }
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "module_not_entitled" });
  });

  test("driver login is unaffected", async ({ page }) => {
    skipUnless(["E2E_ENT_DRIVER_EMAIL", EMAIL.driver]);
    await signIn(page, EMAIL.driver!);
    await expect(page).toHaveURL(/\/driver(\/|\?|$)/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(NO_ACCESS);
  });

  test("invite form hides Company Manager and Employee when not entitled", async ({ page }) => {
    skipUnless(["E2E_ENT_ADMIN_EMAIL", EMAIL.admin]);
    await signIn(page, EMAIL.admin!);
    await page.goto("/users", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Invite user" }).first().click();

    const dialog = page.getByRole("dialog");
    const roleTrigger = dialog.getByRole("combobox");
    await expect(roleTrigger).toContainText("Driver");
    await roleTrigger.click();

    const options = page.getByRole("option");
    await expect(options.filter({ hasText: "Driver" })).toHaveCount(1);
    await expect(options.filter({ hasText: "Organisation Admin" })).toHaveCount(1);
    await expect(options.filter({ hasText: "Company Manager" })).toHaveCount(0);
    await expect(options.filter({ hasText: "Employee" })).toHaveCount(0);

    // Never submit: close without creating an invitation.
    await page.keyboard.press("Escape");
  });
});
