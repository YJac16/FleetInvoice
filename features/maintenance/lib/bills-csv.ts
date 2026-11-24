import { billStatusLabel } from "@/features/maintenance/lib/bill-status";
import { z } from "zod";

/**
 * CSV export of workshop bill lines (U6). Pure: no server-only imports, so it
 * is unit-tested directly. Amounts are the stored line figures, formatted to
 * 2dp from their decimal text; nothing here recomputes VAT or totals.
 */

export const BILL_EXPORT_COLUMNS = [
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
] as const;

/** One bill line as read from the database, joined to its bill. Numeric
 *  columns may arrive as strings or numbers from PostgREST. */
export type BillExportRow = {
  bill_date: string;
  supplier_name: string | null;
  supplier_vat_number: string | null;
  invoice_ref: string;
  vehicle_label: string | null;
  category_name: string | null;
  description: string;
  quantity: string | number;
  unit_amount: string | number;
  line_excl: string | number;
  line_vat: string | number;
  line_incl: string | number;
  vat_mode: string;
  vat_rate: string | number;
  status: string;
};

/** Characters that make Excel / Sheets treat a cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

function quote(raw: string): string {
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/** A text cell: formula-injection guard, then RFC 4180 quoting. */
export function csvTextCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  return quote(FORMULA_START.test(raw) ? `'${raw}` : raw);
}

const DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;

function decimalText(value: string | number, field: string): { int: string; frac: string } {
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : String(value).trim();
  // Numbers like 1e-7 never occur for numeric(14,2); reject anything that isn't plain decimal.
  const m = DECIMAL_RE.exec(text);
  if (!m) throw new Error(`Invalid stored ${field}: ${JSON.stringify(value)}`);
  return { int: m[1].replace(/^0+(?=\d)/, ""), frac: m[2] ?? "" };
}

/** Stored non-negative amount as a plain number with exactly 2dp (no R, no
 *  separators). The stored scale is 2, so this only pads; extra digits would
 *  mean bad data and throw rather than round silently. */
export function csvMoney(value: string | number, field = "amount"): string {
  const { int, frac } = decimalText(value, field);
  const trimmed = frac.replace(/0+$/, "");
  if (trimmed.length > 2) throw new Error(`Unexpected precision in stored ${field}: ${JSON.stringify(value)}`);
  return `${int}.${trimmed.padEnd(2, "0")}`;
}

/** Stored quantity (numeric(12,3)) with trailing zeros trimmed. */
export function csvQty(value: string | number): string {
  const { int, frac } = decimalText(value, "quantity");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${int}.${trimmed}` : int;
}

function rowCells(r: BillExportRow): string[] {
  return [
    csvTextCell(r.bill_date),
    csvTextCell(r.supplier_name),
    csvTextCell(r.supplier_vat_number),
    csvTextCell(r.invoice_ref),
    csvTextCell(r.vehicle_label),
    csvTextCell(r.category_name),
    csvTextCell(r.description),
    csvQty(r.quantity),
    csvMoney(r.unit_amount, "unit_amount"),
    csvMoney(r.line_excl, "line_excl"),
    csvMoney(r.line_vat, "line_vat"),
    csvMoney(r.line_incl, "line_incl"),
    csvTextCell(r.vat_mode),
    csvMoney(r.vat_rate, "vat_rate"),
    csvTextCell(billStatusLabel(r.status)),
  ];
}

/** UTF-8 BOM (so Excel reads the file as UTF-8) + header + CRLF rows. */
export function buildBillsCsv(rows: BillExportRow[]): string {
  const lines = [BILL_EXPORT_COLUMNS.map((h) => csvTextCell(h)).join(",")];
  for (const row of rows) lines.push(rowCells(row).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function exportFilename(filters: { from: string; to: string }): string {
  return `workshop-bills_${filters.from}_${filters.to}.csv`;
}

// ---------------------------------------------------------------------------
// Filters

export const EXPORT_MAX_RANGE_DAYS = 366;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function calendarDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t / 86_400_000;
}

const dateField = (label: string) =>
  z
    .string({ error: `${label} date is required` })
    .refine((v) => calendarDay(v) !== null, `${label} date must be a valid date (YYYY-MM-DD)`);

const optionalId = (label: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || UUID_RE.test(v), `${label} is not valid`);

const exportFilterSchema = z
  .object({
    from: dateField("From"),
    to: dateField("To"),
    vehicle: optionalId("Vehicle"),
    supplier: optionalId("Supplier"),
  })
  .superRefine((v, ctx) => {
    const from = calendarDay(v.from);
    const to = calendarDay(v.to);
    if (from === null || to === null) return;
    if (from > to) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "To date must be on or after the From date" });
    } else if (to - from + 1 > EXPORT_MAX_RANGE_DAYS) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Choose a range of 12 months or less" });
    }
  });

export type BillExportFilters = {
  from: string;
  to: string;
  vehicleId?: string;
  supplierId?: string;
};

export type ParsedExportFilters =
  | { ok: true; filters: BillExportFilters }
  | { ok: false; fieldErrors: Record<string, string> };

/** Reads only from / to / vehicle / supplier. Anything else (an org id
 *  included) is ignored: the org always comes from the session. */
export function parseExportFilters(params: URLSearchParams): ParsedExportFilters {
  const pick = (k: string) => params.get(k) ?? undefined;
  const parsed = exportFilterSchema.safeParse({
    from: pick("from"),
    to: pick("to"),
    vehicle: pick("vehicle"),
    supplier: pick("supplier"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.map(String).join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const { from, to, vehicle, supplier } = parsed.data;
  return {
    ok: true,
    filters: {
      from,
      to,
      ...(vehicle ? { vehicleId: vehicle } : {}),
      ...(supplier ? { supplierId: supplier } : {}),
    },
  };
}
