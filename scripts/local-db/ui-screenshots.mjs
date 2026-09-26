#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(hub|dashboard|driver|employee|company|awaiting-invite)/, {
    timeout: 30000,
  });
}

async function shot(page, name, width) {
  await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await login(page, "playwright.admin@audit.test", "TestPassword123!");
await page.goto(`${BASE}/dashboard`);
await shot(page, "goops-dashboard-admin-1280.png", 1280);
await page.goto(`${BASE}/invoices`);
await shot(page, "goops-invoices-admin-1280.png", 1280);
await page.goto(`${BASE}/settings`);
await shot(page, "goops-settings-tablet-768.png", 768);

await page.goto(`${BASE}/api/auth/end-session`, { method: "POST" }).catch(() => {});
await context.clearCookies();
await login(page, "playwright.driver@audit.test", "TestPassword123!");
await page.goto(`${BASE}/driver`);
await shot(page, "goops-driver-mobile-375.png", 375);
await page.goto(`${BASE}/users`);
await shot(page, "goops-driver-blocked-admin-375.png", 375);

await browser.close();
console.log("Screenshots saved to", OUT);
