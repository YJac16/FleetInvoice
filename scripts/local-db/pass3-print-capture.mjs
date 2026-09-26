#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts";
const INVOICE_ID = process.env.AUDIT_INVOICE_ID ?? "04e29b44-6b4b-4086-a94e-e3a7fc270a2d";
const PASS = "TestPassword123!";

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(hub|dashboard|driver|employee|company)/, { timeout: 45000 });
}

const browser = await chromium.launch();
const page = await browser.newPage();
const parity = {};

await login(page, "playwright.admin@audit.test");
await page.goto(`${BASE}/invoices`);
await page
  .locator("table tbody tr")
  .filter({ hasText: /Very Long Client/i })
  .getByRole("button", { name: /^Lines$/i })
  .click();
await page.waitForTimeout(2000);
await page.setViewportSize({ width: 1280, height: 900 });
await page.screenshot({ path: `${OUT}/goops-invoice-ui-lines-detail-1280.png`, fullPage: true });
parity.uiText = await page.locator("main").innerText();

await page.goto(`${BASE}/invoices/${INVOICE_ID}/print`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/goops-invoice-print-pdf-1280.png`, fullPage: true });
parity.printText = await page.locator("body").innerText();
parity.uiTotal = (parity.uiText.match(/ZAR\s*([\d.]+)/) ?? [])[1];
parity.printTotal = (parity.printText.match(/Total[^\d]*([\d,]+\.\d{2})/i) ?? [])[1];

const ctx2 = await browser.newContext();
const p2 = await ctx2.newPage();
await login(p2, "playwright.admin.b@audit.test");
await p2.goto(`${BASE}/invoices/${INVOICE_ID}`);
await p2.waitForTimeout(1500);
parity.orgBDetail = p2.url();
await p2.screenshot({ path: `${OUT}/goops-orgb-invoice-detail-blocked-1280.png`, fullPage: true });
await p2.goto(`${BASE}/invoices/${INVOICE_ID}/print`);
await p2.waitForTimeout(1500);
parity.orgBPrint = p2.url();
await p2.screenshot({ path: `${OUT}/goops-orgb-invoice-print-blocked-1280.png`, fullPage: true });

writeFileSync(`${OUT}/goops-invoice-parity.json`, JSON.stringify(parity, null, 2));
await browser.close();
console.log("parity", parity.uiTotal, parity.printTotal);
