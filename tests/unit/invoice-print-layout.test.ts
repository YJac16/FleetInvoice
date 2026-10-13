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

  it("lets the trip table break so rows can start on page 1", () => {
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
    expect(tableParts).toMatch(/page-break-inside:\s*auto/);
    expect(tableParts).not.toMatch(/avoid/);

    const table = ruleBlock(css, ".invoice-print-sheet table");
    expect(table).toMatch(/display:\s*table\s*!important/);

    const thead = ruleBlock(css, ".invoice-print-sheet thead");
    expect(thead).toMatch(/display:\s*table-header-group/);

    const totals = ruleBlock(
      css,
      `.invoice-print-table-totals,
  .invoice-print-table-totals tr,
  .invoice-print-total-row`
    );
    expect(totals).toMatch(/break-inside:\s*avoid/);

    const lastRow = ruleBlock(css, ".invoice-print-lines-table tbody tr:last-child");
    expect(lastRow).toMatch(/break-after:\s*avoid/);
  });

  it("uses A4 portrait and widens company/area columns without break-all on refs", () => {
    const css = printCss();
    expect(css).toMatch(/size:\s*A4\s+portrait/);

    const company = ruleBlock(css, ".invoice-print-col-company");
    expect(company).toMatch(/width:\s*30%/);
    expect(company).not.toMatch(/break-all/);

    const area = ruleBlock(css, ".invoice-print-col-area");
    expect(area).toMatch(/width:\s*24%/);

    const refValue = ruleBlock(css, ".invoice-print-cover-meta-value");
    expect(refValue).toMatch(/white-space:\s*nowrap/);
    expect(refValue).not.toMatch(/break-all/);

    const view = readRepo("features/invoices/components/invoice-print-view.tsx");
    expect(view).toContain("invoice-print-table-totals");
    expect(view).toContain("<tfoot");
    expect(view).not.toMatch(/Total:[\s\S]{0,120}<\/footer>/);
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
