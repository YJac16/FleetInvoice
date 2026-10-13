import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");

export function readInvoicePrintStyles(): string {
  const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
  const start = css.indexOf("@media print");
  if (start < 0) throw new Error("missing @media print in globals.css");
  return css.slice(start);
}

function fixtureRowPadding(lineCount: number): string {
  if (lineCount <= 16) return "0.68rem";
  if (lineCount <= 24) return "0.55rem";
  return "0.45rem";
}

const SCREEN_TABLE_CSS_BASE = `
.invoice-print-lines-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.invoice-print-col-no { width: 5%; }
.invoice-print-col-date { width: 14%; padding-right: 0.4rem; white-space: nowrap; }
.invoice-print-col-time { width: 8%; white-space: nowrap; }
.invoice-print-col-company { width: 26%; overflow-wrap: break-word; word-break: normal; }
.invoice-print-col-pax { width: 6%; }
.invoice-print-col-area { width: 29%; overflow-wrap: break-word; word-break: normal; }
.invoice-print-col-amount { width: 12%; white-space: nowrap; }
.invoice-print-area-ref { white-space: nowrap; }
`;

function sampleRow(lineNumber: number): string {
  const date = "31/08/2026";
  const time = "18h00";
  const company = "Lewis Head Office";
  const area = `Central / SS-STOP-${lineNumber}`;
  const amount = "R300.00";
  return `
    <tr class="invoice-print-line-row border-b border-black/10 align-top">
      <td class="invoice-print-col-no py-2 pr-2 tabular-nums">${lineNumber}</td>
      <td class="invoice-print-col-date py-2 pr-2">${date}</td>
      <td class="invoice-print-col-time py-2 pr-2">${time}</td>
      <td class="invoice-print-col-company py-2 pr-2">${company}</td>
      <td class="invoice-print-col-pax py-2 pr-2 tabular-nums">12</td>
      <td class="invoice-print-col-area py-2 pr-2">${area}</td>
      <td class="invoice-print-col-amount py-2 text-right tabular-nums">${amount}</td>
    </tr>`;
}

export function buildInvoicePrintFixtureHtml(lineCount: number): string {
  const rows = Array.from({ length: lineCount }, (_, i) => sampleRow(i + 1)).join(
    "\n"
  );
  const printCss = readInvoicePrintStyles();
  const rowPad = fixtureRowPadding(lineCount);
  const screenTableCss = `${SCREEN_TABLE_CSS_BASE}
.invoice-print-lines-table tbody tr td {
  padding-top: ${rowPad};
  padding-bottom: ${rowPad};
  line-height: 1.5;
}
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; font-size: 14px; }
    ${screenTableCss}
    ${printCss}
  </style>
</head>
<body>
  <div class="invoice-print-root invoice-print-flow">
    <article class="invoice-print-sheet invoice-print-flow">
      <header class="grid gap-6 border-b border-black/20 pb-4">
        <div>
          <p class="text-lg font-semibold">Fixture Supplier</p>
          <p>123 Test Street</p>
        </div>
        <div>
          <p><span class="font-medium">Date:</span> 01/09/2026</p>
        </div>
      </header>
      <section class="mt-5">
        <p class="text-xs font-semibold">INVOICE TO</p>
        <p class="text-base font-semibold">Acme Corp</p>
        <p>12 Example Street</p>
        <p>Industrial Park, Johannesburg</p>
        <p>Gauteng, 2001</p>
        <div class="invoice-print-cover-meta pt-1 text-xs uppercase">
          <p class="invoice-print-cover-meta-line">
            <span class="invoice-print-cover-meta-label">REG NO:</span>
            <span class="invoice-print-cover-meta-value">SS-REG-12345</span>
          </p>
        </div>
      </section>
      <table class="invoice-print-lines-table mt-6 w-full text-sm">
        <colgroup>
          <col class="invoice-print-col-no" />
          <col class="invoice-print-col-date" />
          <col class="invoice-print-col-time" />
          <col class="invoice-print-col-company" />
          <col class="invoice-print-col-pax" />
          <col class="invoice-print-col-area" />
          <col class="invoice-print-col-amount" />
        </colgroup>
        <thead>
          <tr class="border-b border-black/30 text-left text-xs uppercase">
            <th class="invoice-print-col-no py-2 pr-2 font-semibold">N0.</th>
            <th class="invoice-print-col-date py-2 pr-2 font-semibold">DATE</th>
            <th class="invoice-print-col-time py-2 pr-2 font-semibold">TIME</th>
            <th class="invoice-print-col-company py-2 pr-2 font-semibold">COMPANY</th>
            <th class="invoice-print-col-pax py-2 pr-2 font-semibold">PAX</th>
            <th class="invoice-print-col-area py-2 pr-2 font-semibold">Area</th>
            <th class="invoice-print-col-amount py-2 text-right font-semibold">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot class="invoice-print-table-totals">
          <tr class="invoice-print-total-row border-t border-black/20">
            <td colspan="6" class="py-3 pr-2 text-right text-base font-semibold">Total:</td>
            <td class="invoice-print-col-amount py-3 text-right text-base font-semibold tabular-nums">R${(lineCount * 300).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      <footer class="invoice-print-sheet-footer mt-4">
        <div class="invoice-print-banking-block space-y-1">
          <p class="text-xs font-semibold">BANKING DETAILS</p>
          <p>Bank: Test Bank</p>
          <p>Account Number: 123456789</p>
        </div>
      </footer>
    </article>
  </div>
</body>
</html>`;
}

/** A4 portrait page height in CSS pixels (96dpi) for layout probes. */
export const A4_PAGE_HEIGHT_PX = (297 * 96) / 25.4;

export type InvoicePrintLayoutProbe = {
  ok: boolean;
  reason?: string;
  detail?: string;
};

/** Runs in the browser via Playwright `page.evaluate`. */
export function evaluateInvoicePrintLayout(
  pageHeight: number
): InvoicePrintLayoutProbe {
  const pageIndex = (y: number) => Math.floor(y / pageHeight);

  const sheet = document.querySelector(".invoice-print-sheet");
  if (!sheet) return { ok: false, reason: "missing-sheet" };

  const rows = [
    ...document.querySelectorAll(".invoice-print-lines-table tbody tr"),
  ];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const rect = row.getBoundingClientRect();
    const date = row.querySelector(".invoice-print-col-date");
    const time = row.querySelector(".invoice-print-col-time");
    if (date && time) {
      const dr = date.getBoundingClientRect();
      const tr = time.getBoundingClientRect();
      if (dr.right > tr.left + 0.5) {
        return {
          ok: false,
          reason: "date-time-overlap",
          detail: String(index + 1),
        };
      }
    }
  }

  const total = document.querySelector(".invoice-print-total-row");
  const lastRow = rows[rows.length - 1];
  if (total && lastRow) {
    const lastPage = pageIndex(lastRow.getBoundingClientRect().top);
    const totalPage = pageIndex(total.getBoundingClientRect().top);
    if (totalPage !== lastPage) {
      return { ok: false, reason: "total-orphaned" };
    }
  }

  return { ok: true };
}
