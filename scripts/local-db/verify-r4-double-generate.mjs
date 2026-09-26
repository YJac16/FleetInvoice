#!/usr/bin/env node
/** Browser check: double-click period generate does not add a second invoice row. */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts";
const PASS = "TestPassword123!";
const PERIOD = "2030-06-10"; // Monday
const COMPANY = "Company A2";

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[name="email"]').fill("playwright.admin@audit.test");
  await page.locator('input[name="password"]').fill(PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(hub|dashboard)/, { timeout: 45000 });
}

const browser = await chromium.launch();
const page = await browser.newPage();
await login(page);
await page.goto(`${BASE}/invoices`);
const beforeText = await page.locator("main").innerText();
const beforeCount = (beforeText.match(new RegExp(COMPANY, "g")) ?? []).length;

await page.getByRole("button", { name: /^Generate period$/i }).click();
const dialog = page.getByRole("dialog", { name: /generate period invoice/i });
await dialog.waitFor({ state: "visible" });
await dialog.getByRole("combobox").click();
await page.getByRole("option", { name: COMPANY }).click();
await dialog.locator('input[type="date"]').fill(PERIOD);
const btn = dialog.getByRole("button", { name: /generate period invoice/i });
await btn.dblclick();
await page.waitForTimeout(5000);

const afterText = await page.locator("main").innerText();
const periodLabel = "10 Jun 2030";
const matchingRows = afterText
  .split("\n")
  .filter((line) => line.includes(COMPANY) && line.includes(periodLabel));

await page.screenshot({ path: `${OUT}/goops-r4-double-generate-after-1280.png`, fullPage: true });
const result = {
  company: COMPANY,
  periodStart: PERIOD,
  rowsMatchingPeriod: matchingRows.length,
  pass: matchingRows.length <= 1,
};
writeFileSync(`${OUT}/goops-r4-double-generate.json`, JSON.stringify(result, null, 2));
await browser.close();
console.log(JSON.stringify(result));
process.exit(result.pass ? 0 : 1);
