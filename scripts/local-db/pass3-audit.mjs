#!/usr/bin/env node
/**
 * Pass 3 browser audit: invoice lifecycle, portals, edge cases, artifacts.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts";
const PASS = "TestPassword123!";
const SERVICE_WEEK = "2026-09-22";
const LONG_COMPANY =
  "Very Long Client Company Name (Pty) Ltd — Northern Region Shuttle Contract 2026";

mkdirSync(OUT, { recursive: true });

const results = {
  timestamp: new Date().toISOString(),
  nextDevIssues: [],
  invoiceParity: null,
  crossOrg: {},
  driverUsersUrl: null,
  portals: {},
  edgeCases: {},
  errors: [],
};

function saveJson() {
  writeFileSync(
    join(OUT, "goops-pass3-results.json"),
    JSON.stringify(results, null, 2)
  );
}

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(hub|dashboard|driver|employee|company|awaiting-invite)/, {
    timeout: 45000,
  });
}

async function logout(context) {
  await context.clearCookies();
}

async function shot(page, name, width, { fullPage = true, tall = false } = {}) {
  const height = tall ? 2400 : width === 375 ? 812 : 900;
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(tall ? 400 : 800);
  await page.screenshot({ path: join(OUT, name), fullPage });
}

async function annotateUrl(page, name, width = 375) {
  await page.evaluate(() => {
    let el = document.getElementById("audit-url-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "audit-url-banner";
      el.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:99999;background:#111;color:#0f0;font:12px monospace;padding:6px 8px;";
      document.body.prepend(el);
    }
    el.textContent = `AUDIT final URL: ${location.href}`;
  });
  await shot(page, name, width);
}

async function captureNextIssues(page) {
  const logs = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (/error|warning|issue|hydration|React/i.test(t)) logs.push(t);
  });
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(2500);
  const issueButtons = page.locator("button").filter({ hasText: /Issue/i });
  const count = await issueButtons.count();
  for (let i = 0; i < count; i++) {
    const label = await issueButtons.nth(i).innerText().catch(() => "");
    if (/\d+\s+Issue/i.test(label)) {
      results.nextDevIssues.push({ badge: label.trim(), source: "dev-overlay" });
      await issueButtons.nth(i).click().catch(() => {});
      await page.waitForTimeout(1000);
      await shot(page, "goops-next-dev-issues-overlay-1280.png", 1280);
      break;
    }
  }
  for (const t of logs.slice(0, 25)) {
    results.nextDevIssues.push({ log: t });
  }
}

async function pickCompanyInPeriodDialog(page, companySubstring) {
  const dialog = page.getByRole("dialog", { name: /generate period invoice/i });
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: new RegExp(companySubstring.slice(0, 30), "i") }).click();
  await dialog.locator('input[type="date"]').fill(SERVICE_WEEK);
}

async function portalWalk(page, roleKey, email, routes, widths) {
  results.portals[roleKey] = { email, shots: [], blocked: [] };
  await login(page, email);
  for (const w of widths) {
    const slug = routes.home.replace(/\//g, "") || "home";
    await page.goto(`${BASE}${routes.home}`);
    await shot(page, `goops-${roleKey}-${slug}-${w}.png`, w);
    results.portals[roleKey].shots.push(`${routes.home}@${w}`);
  }
  for (const blocked of routes.blocked ?? []) {
    await page.goto(`${BASE}${blocked}`);
    await page.waitForTimeout(1500);
    const url = page.url();
    results.portals[roleKey].blocked.push({ attempted: blocked, finalUrl: url });
    if (roleKey === "driver" && blocked === "/users") {
      results.driverUsersUrl = url;
      await annotateUrl(page, "goops-driver-blocked-admin-375.png", 375);
    }
  }
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

try {
  await login(page, "playwright.admin@audit.test");
  await captureNextIssues(page);

  await page.goto(`${BASE}/settings`);
  await shot(page, "goops-sidebar-tall-settings-1280.png", 1280, { tall: true });
  await shot(page, "goops-dashboard-admin-1280.png", 1280);

  // Invoice lifecycle
  await page.goto(`${BASE}/invoices`);
  await page.getByRole("button", { name: /^Generate period$/i }).click();
  await pickCompanyInPeriodDialog(page, LONG_COMPANY);
  const dialog = page.getByRole("dialog", { name: /generate period invoice/i });
  await dialog.getByRole("button", { name: /generate period invoice/i }).click();
  await page.waitForTimeout(4000);

  // Select newest draft for long company
  const invoiceRow = page
    .locator("table tbody tr")
    .filter({ hasText: /Very Long Client/i })
    .first();
  if (await invoiceRow.count()) {
    await invoiceRow.click();
  } else {
    await page.locator("table tbody tr").first().click();
  }
  await page.waitForTimeout(2000);

  const bodyText = await page.locator("main").innerText();
  results.invoiceParity = {
    uiBodySnippet: bodyText.slice(0, 500),
    longCompanyInUi: bodyText.includes("Very Long Client"),
  };

  const editLine = page.getByRole("button", { name: /^Edit$/i }).first();
  if (await editLine.isVisible().catch(() => false)) {
    await editLine.click();
    const desc = page.getByLabel(/description/i);
    if (await desc.isVisible().catch(() => false)) {
      await desc.fill(
        "Long description — special «§» chars; includes R0.00 line after edit"
      );
      await page.getByRole("button", { name: /^Save$/i }).click();
      await page.waitForTimeout(1200);
    }
  }

  const markIssued = page.getByRole("button", { name: /mark issued|issue/i }).first();
  if (await markIssued.isVisible().catch(() => false)) {
    await markIssued.click();
    await page.waitForTimeout(1500);
  }

  await shot(page, "goops-invoice-ui-lines-1280.png", 1280);

  let invoiceId = "";
  const printBtn = page.getByRole("link", { name: /print preview/i });
  if (await printBtn.isVisible().catch(() => false)) {
    const href = (await printBtn.getAttribute("href")) ?? "";
    const m = href.match(/invoices\/([^/]+)\/print/);
    if (m) invoiceId = m[1];
    await printBtn.click();
    await page.waitForTimeout(2500);
    await shot(page, "goops-invoice-print-pdf-1280.png", 1280, { fullPage: true });
    const printText = await page.locator("body").innerText();
    const totalMatches = [...printText.matchAll(/(?:Total|ZAR)\s*([\d,]+\.\d{2})/gi)];
    results.invoiceParity = {
      ...results.invoiceParity,
      invoiceId,
      printTotalMatches: totalMatches.map((x) => x[1]).slice(-3),
      longCompanyPresent: printText.includes("Very Long Client"),
      largeFuelPresent: /79[\s,]?999/.test(printText),
      zeroPresent: /\b0\.00\b/.test(printText),
      lineCountApprox: (printText.match(/\d+\.\d{2}/g) ?? []).length,
    };
  }

  writeFileSync(
    join(OUT, "goops-invoice-ui-vs-print-note.txt"),
    `UI lines: goops-invoice-ui-lines-1280.png\nPrint/PDF view: goops-invoice-print-pdf-1280.png\nInvoice id: ${invoiceId}\n`
  );

  await logout(context);

  if (invoiceId) {
    await login(page, "playwright.admin.b@audit.test");
    await page.goto(`${BASE}/invoices/${invoiceId}`);
    await page.waitForTimeout(1500);
    results.crossOrg.detailUrl = page.url();
    await shot(page, "goops-orgb-invoice-detail-blocked-1280.png", 1280);
    await page.goto(`${BASE}/invoices/${invoiceId}/print`);
    await page.waitForTimeout(1500);
    results.crossOrg.printUrl = page.url();
    await shot(page, "goops-orgb-invoice-print-blocked-1280.png", 1280);
    await logout(context);
  }

  await portalWalk(
    page,
    "driver",
    "playwright.driver@audit.test",
    { home: "/driver", blocked: ["/users", "/dashboard"] },
    [375, 1280]
  );
  await page.goto(`${BASE}/driver/history`);
  await shot(page, "goops-driver-history-375.png", 375);
  await logout(context);

  await portalWalk(
    page,
    "employee",
    "playwright.employee@audit.test",
    { home: "/employee", blocked: ["/dashboard", "/invoices"] },
    [375, 1280]
  );
  await logout(context);

  await portalWalk(
    page,
    "company",
    "playwright.company@audit.test",
    { home: "/company", blocked: ["/users", "/settings"] },
    [375, 1280]
  );
  await logout(context);

  await portalWalk(
    page,
    "platform",
    "playwright.platform@audit.test",
    { home: "/dashboard", blocked: ["/driver"] },
    [375, 1280]
  );
  await logout(context);

  await login(page, "playwright.admin@audit.test");
  await page.goto(`${BASE}/invoices/00000000-0000-4000-8000-000000000099`);
  await page.waitForTimeout(1500);
  results.edgeCases.invalidInvoiceUuid = page.url();
  await shot(page, "goops-edge-invalid-invoice-uuid-1280.png", 1280);

  await logout(context);
  await login(page, "playwright.admin@audit.test");
  await logout(context);
  await page.goto(`${BASE}/invoices`);
  await page.waitForTimeout(1500);
  results.edgeCases.expiredSessionUrl = page.url();
  await shot(page, "goops-edge-expired-session-1280.png", 1280);

  await login(page, "playwright.admin@audit.test");
  await page.goto(`${BASE}/invoices`);
  await page.getByRole("button", { name: /^Generate period$/i }).click();
  await pickCompanyInPeriodDialog(page, "Company A1");
  const d2 = page.getByRole("dialog", { name: /generate period invoice/i });
  await d2.getByRole("button", { name: /generate period invoice/i }).dblclick();
  await page.waitForTimeout(2500);
  results.edgeCases.doubleSubmitGenerate = "dblclick on generate";
  await shot(page, "goops-edge-double-generate-1280.png", 1280);
} catch (e) {
  results.errors.push(String(e?.message ?? e));
  await shot(page, "goops-pass3-error-state.png", 1280).catch(() => {});
} finally {
  saveJson();
  await browser.close();
}

console.log("Pass 3 audit complete.", join(OUT, "goops-pass3-results.json"));
