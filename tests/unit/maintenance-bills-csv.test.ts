/**
 * U6: CSV building and filter parsing for the workshop bills export.
 */
import { describe, expect, it } from "vitest";

import {
  BILL_EXPORT_COLUMNS,
  buildBillsCsv,
  csvMoney,
  csvQty,
  csvTextCell,
  exportFilename,
  parseExportFilters,
  type BillExportRow,
} from "@/features/maintenance/lib/bills-csv";

const VEHICLE = "c0000000-0000-4000-8000-000000000001";
const SUPPLIER = "d0000000-0000-4000-8000-000000000001";

function row(extra: Partial<BillExportRow> = {}): BillExportRow {
  return {
    bill_date: "2026-11-20",
    supplier_name: "Tyre World",
    supplier_vat_number: "4123456789",
    invoice_ref: "INV-1",
    vehicle_label: "Truck 1 / CA 123-456",
    category_name: "Tyres",
    description: "Front tyres",
    quantity: "2.000",
    unit_amount: "1500.00",
    line_excl: "3000.00",
    line_vat: "450.00",
    line_incl: "3450.00",
    vat_mode: "exclusive",
    vat_rate: "15.00",
    status: "approved",
    ...extra,
  };
}

function parse(csv: string): string[] {
  return csv.replace(/^﻿/, "").split("\r\n");
}

describe("buildBillsCsv", () => {
  it("starts with a UTF-8 BOM, uses CRLF and the fixed header order", () => {
    const csv = buildBillsCsv([row()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replace(/\r\n/g, "")).not.toMatch(/\n/);
    const [header] = parse(csv);
    expect(header).toBe(BILL_EXPORT_COLUMNS.join(","));
    expect(BILL_EXPORT_COLUMNS).toEqual([
      "Bill date",
      "Supplier",
      "Supplier VAT no.",
      "Invoice ref",
      "Vehicle",
      "Category",
      "Description",
      "Qty",
      "Unit amount (ZAR)",
      "Excl. VAT (ZAR)",
      "VAT (ZAR)",
      "Incl. VAT (ZAR)",
      "VAT mode",
      "VAT rate (%)",
      "Status",
    ]);
  });

  it("writes one row per line with the stored figures", () => {
    const [, line] = parse(buildBillsCsv([row()]));
    expect(line).toBe(
      "2026-11-20,Tyre World,4123456789,INV-1,Truck 1 / CA 123-456,Tyres,Front tyres,2,1500.00,3000.00,450.00,3450.00,exclusive,15.00,Final"
    );
  });

  it("never recomputes: inconsistent stored figures are written as stored", () => {
    const [, line] = parse(
      buildBillsCsv([row({ quantity: "1", unit_amount: "100", line_excl: "100.00", line_vat: "14.99", line_incl: "115.01" })])
    );
    expect(line.split(",").slice(7, 12)).toEqual(["1", "100.00", "100.00", "14.99", "115.01"]);
  });

  it("empty export is header only", () => {
    expect(parse(buildBillsCsv([]))).toEqual([BILL_EXPORT_COLUMNS.join(","), ""]);
  });

  it("leaves null supplier VAT no., vehicle and category empty", () => {
    const [, line] = parse(buildBillsCsv([row({ supplier_vat_number: null, vehicle_label: null, category_name: null })]));
    const cells = line.split(",");
    expect(cells[2]).toBe("");
    expect(cells[4]).toBe("");
    expect(cells[5]).toBe("");
  });

  it("keeps non-ASCII text intact", () => {
    const csv = buildBillsCsv([row({ supplier_name: "Société Générale Müller", description: "Ölwechsel – 5W30" })]);
    expect(csv).toContain("Société Générale Müller");
    expect(csv).toContain("Ölwechsel – 5W30");
  });

  it("guards text cells against formula injection", () => {
    const csv = buildBillsCsv([
      row({ supplier_name: '=HYPERLINK("http://x","y")', description: "+1", invoice_ref: "-2+3", category_name: "@SUM(A1)" }),
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csv).toContain(",'+1,");
    expect(csv).toContain(",'-2+3,");
    expect(csv).toContain(",'@SUM(A1),");
  });
});

describe("csvTextCell", () => {
  it("prefixes =, +, -, @, tab and CR", () => {
    expect(csvTextCell("=1+1")).toBe("'=1+1");
    expect(csvTextCell("+27 82")).toBe("'+27 82");
    expect(csvTextCell("-5")).toBe("'-5");
    expect(csvTextCell("@cmd")).toBe("'@cmd");
    expect(csvTextCell("\tx")).toBe("'\tx");
    expect(csvTextCell("\rx")).toBe(`"'\rx"`);
  });

  it("does not prefix ordinary text, even with those characters later", () => {
    expect(csvTextCell("Brake pads - front")).toBe("Brake pads - front");
    expect(csvTextCell("a@b.co.za")).toBe("a@b.co.za");
  });

  it("quotes commas, quotes and newlines (RFC 4180)", () => {
    expect(csvTextCell("Smith, J")).toBe('"Smith, J"');
    expect(csvTextCell('6" pipe')).toBe('"6"" pipe"');
    expect(csvTextCell("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(csvTextCell(null)).toBe("");
    expect(csvTextCell(undefined)).toBe("");
  });
});

describe("csvMoney / csvQty", () => {
  it("formats stored amounts as plain 2dp numbers", () => {
    expect(csvMoney("1234.5")).toBe("1234.50");
    expect(csvMoney(0)).toBe("0.00");
    expect(csvMoney("0")).toBe("0.00");
    expect(csvMoney("1000000.00")).toBe("1000000.00");
    expect(csvMoney(15)).toBe("15.00");
    expect(csvMoney(99.99)).toBe("99.99");
    expect(csvMoney("007.10")).toBe("7.10");
  });

  it("rejects values that aren't stored non-negative decimals", () => {
    expect(() => csvMoney("-1.00")).toThrow();
    expect(() => csvMoney(Number.NaN)).toThrow();
    expect(() => csvMoney("R 10")).toThrow();
    expect(() => csvMoney("1.234")).toThrow();
  });

  it("trims trailing zeros on quantity", () => {
    expect(csvQty("2.500")).toBe("2.5");
    expect(csvQty("1.000")).toBe("1");
    expect(csvQty(1)).toBe("1");
    expect(csvQty("0.125")).toBe("0.125");
  });
});

describe("parseExportFilters", () => {
  const p = (q: string) => parseExportFilters(new URLSearchParams(q));

  it("accepts a valid range with optional ids", () => {
    expect(p("from=2026-01-01&to=2026-11-23")).toEqual({ ok: true, filters: { from: "2026-01-01", to: "2026-11-23" } });
    expect(p(`from=2026-01-01&to=2026-01-31&vehicle=${VEHICLE}&supplier=${SUPPLIER}`)).toEqual({
      ok: true,
      filters: { from: "2026-01-01", to: "2026-01-31", vehicleId: VEHICLE, supplierId: SUPPLIER },
    });
  });

  it("treats empty vehicle / supplier as absent", () => {
    expect(p("from=2026-01-01&to=2026-01-31&vehicle=&supplier=")).toEqual({
      ok: true,
      filters: { from: "2026-01-01", to: "2026-01-31" },
    });
  });

  it("ignores an organisation id in the query", () => {
    const r = p("from=2026-01-01&to=2026-01-31&organisation_id=b0000000-0000-4000-8000-000000000001");
    expect(r).toEqual({ ok: true, filters: { from: "2026-01-01", to: "2026-01-31" } });
  });

  it("requires both dates", () => {
    const r = p("to=2026-01-31");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.from).toBeDefined();
    expect(p("from=2026-01-01").ok).toBe(false);
  });

  it("rejects impossible or malformed dates", () => {
    expect(p("from=2026-02-30&to=2026-03-01").ok).toBe(false);
    expect(p("from=01/02/2026&to=2026-03-01").ok).toBe(false);
    expect(p("from=2028-02-29&to=2028-03-01").ok).toBe(true);
  });

  it("rejects from after to", () => {
    const r = p("from=2026-02-01&to=2026-01-31");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.to).toMatch(/on or after/);
  });

  it("allows at most 366 days inclusive", () => {
    expect(p("from=2028-01-01&to=2028-12-31").ok).toBe(true); // 366 days (leap year)
    const r = p("from=2026-01-01&to=2027-01-02"); // 367 days
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.to).toMatch(/12 months/);
  });

  it("rejects non-uuid vehicle / supplier", () => {
    const r = p("from=2026-01-01&to=2026-01-31&vehicle=abc&supplier=1;drop");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.vehicle).toBeDefined();
      expect(r.fieldErrors.supplier).toBeDefined();
    }
  });
});

describe("exportFilename", () => {
  it("names the file after the range", () => {
    expect(exportFilename({ from: "2026-11-01", to: "2026-11-23" })).toBe("workshop-bills_2026-11-01_2026-11-23.csv");
  });
});
