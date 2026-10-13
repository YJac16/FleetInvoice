import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

function readRepo(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function printCss(): string {
  const css = readRepo("app/globals.css");
  const start = css.indexOf("@media print");
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start);
}

function ruleBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `missing rule ${selector}`).toBeTruthy();
  return match?.[1] ?? "";
}

const COLUMN_WIDTHS: Record<string, string> = {
  ".invoice-print-col-no": "5%",
  ".invoice-print-col-date": "13%",
  ".invoice-print-col-time": "8%",
  ".invoice-print-col-company": "26%",
  ".invoice-print-col-pax": "6%",
  ".invoice-print-col-area": "30%",
  ".invoice-print-col-amount": "12%",
};

describe("invoice print pagination", () => {
  it("does not reserve a full page under the letterhead", () => {
    const css = printCss();
    expect(css).not.toMatch(/min-height:\s*100vh/);
    expect(css).not.toMatch(/min-height:\s*100dvh/);
    const sheet = ruleBlock(
      css,
      `.invoice-print-root,
  .invoice-print-sheet`
    );
    expect(sheet).toMatch(/min-height:\s*0\s*!important/);
    expect(sheet).toMatch(/height:\s*auto\s*!important/);
  });

  it("keeps tbody rows and totals together while allowing the table to paginate", () => {
    const css = printCss();
    const avoid = ruleBlock(css, ".invoice-print-sheet header");
    expect(avoid).toMatch(/break-inside:\s*avoid/);

    const tableParts = ruleBlock(
      css,
      `.invoice-print-sheet table,
  .invoice-print-sheet thead,
  .invoice-print-sheet tbody,
  .invoice-print-sheet tfoot`
    );
    expect(tableParts).toMatch(/break-inside:\s*auto/);

    const lineRow = ruleBlock(css, ".invoice-print-lines-table tbody tr");
    expect(lineRow).toMatch(/break-inside:\s*avoid/);
    expect(lineRow).toMatch(/page-break-inside:\s*avoid/);

    const totals = ruleBlock(
      css,
      `.invoice-print-table-totals,
  .invoice-print-table-totals tr,
  .invoice-print-total-row`
    );
    expect(totals).toMatch(/break-inside:\s*avoid/);

    const lastRow = ruleBlock(css, ".invoice-print-lines-table tbody tr:last-child");
    expect(lastRow).toMatch(/break-after:\s*avoid/);

    const banking = ruleBlock(css, ".invoice-print-banking-block");
    expect(banking).toMatch(/break-inside:\s*avoid/);
  });

  it("uses A4 portrait, fixed column widths summing to 100%, and safe ref wrapping", () => {
    const css = printCss();
    expect(css).toMatch(/size:\s*A4\s+portrait/);

    let widthSum = 0;
    for (const [selector, width] of Object.entries(COLUMN_WIDTHS)) {
      const block = ruleBlock(css, selector);
      expect(block).toMatch(new RegExp(`width:\\s*${width.replace("%", "\\%")}`));
      widthSum += Number.parseInt(width, 10);
      expect(block).not.toMatch(/break-all/);
      if (selector.includes("area")) {
        expect(block).not.toMatch(/overflow-wrap:\s*anywhere/);
        expect(block).toMatch(/overflow-wrap:\s*break-word/);
      }
    }
    expect(widthSum).toBe(100);

    const date = ruleBlock(css, ".invoice-print-col-date");
    expect(date).toMatch(/white-space:\s*nowrap/);
    const time = ruleBlock(css, ".invoice-print-col-time");
    expect(time).toMatch(/white-space:\s*nowrap/);
    const amount = ruleBlock(css, ".invoice-print-col-amount");
    expect(amount).toMatch(/white-space:\s*nowrap/);

    const refValue = ruleBlock(css, ".invoice-print-cover-meta-value");
    expect(refValue).toMatch(/white-space:\s*nowrap/);

    const view = readRepo("features/invoices/components/invoice-print-view.tsx");
    expect(view).toContain("invoice-print-table-totals");
    expect(view).toContain("invoice-print-mobile-total");
    expect(view).toContain("renderInvoicePrintArea");
    expect(view).toContain("invoice-print-banking-block");
    expect(view).toContain("<colgroup");
  });

  it("turns shell flex containers into normal flow while printing an invoice", () => {
    const css = printCss();
    const flow = ruleBlock(
      css,
      "body:has(.invoice-print-sheet) .invoice-print-flow"
    );
    expect(flow).toMatch(/display:\s*block\s*!important/);
    expect(flow).toMatch(/min-height:\s*0\s*!important/);
    expect(flow).toMatch(/overflow:\s*visible\s*!important/);
  });

  it("keeps the print view from forcing a full-page sheet", () => {
    const view = readRepo("features/invoices/components/invoice-print-view.tsx");
    expect(view).not.toContain("print:min-h-screen");
    expect(view).not.toContain("min-h-screen");
    expect(view).toContain("buildInvoiceCoverMetaLines");
    expect(view).not.toMatch(/REG NO:[\s\S]{0,80}DRIVER:/);
    expect(view).not.toMatch(/DRIVER:[^\n]*·/);
  });
});
