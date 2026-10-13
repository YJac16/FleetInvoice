import { test, expect } from "@playwright/test";

import {
  A4_PAGE_HEIGHT_PX,
  buildInvoicePrintFixtureHtml,
  evaluateInvoicePrintLayout,
} from "./helpers/invoice-print-fixture";

test.describe("invoice print layout (Chromium print)", () => {
  test.use({ javaScriptEnabled: true });

  for (const lineCount of [16, 40] as const) {
    test(`${lineCount} lines: rows intact, total with table, date/time separated`, async ({
      page,
    }) => {
      await page.setContent(buildInvoicePrintFixtureHtml(lineCount), {
        waitUntil: "load",
      });
      await page.emulateMedia({ media: "print" });
      await page.setViewportSize({ width: 794, height: 4000 });

      const layout = await page.evaluate(evaluateInvoicePrintLayout, A4_PAGE_HEIGHT_PX);
      expect(
        layout.ok,
        layout.reason
          ? `${layout.reason}${layout.detail ? ` (row ${layout.detail})` : ""}`
          : "layout probe failed"
      ).toBe(true);

      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      expect(pdf.byteLength).toBeGreaterThan(1000);
    });
  }
});
