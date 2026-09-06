/** dd/MM/yyyy — matches Yaseen shuttle invoice PDFs */
export function formatInvoiceDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Invoice print date = Monday after the service week.
 * Weekly periods store Mon–Sun; `period_end` may be inclusive Sunday or exclusive Monday.
 */
export function computeInvoiceDateFromPeriodEnd(
  periodEnd: string | null | undefined
): string | null {
  if (!periodEnd?.trim()) return null;

  const dateOnly = periodEnd.trim().slice(0, 10);
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;

  const day = d.getUTCDay();

  if (day === 1) {
    return dateOnly;
  }

  if (day === 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  const daysToSunday = 7 - day;
  d.setUTCDate(d.getUTCDate() + daysToSunday + 1);
  return d.toISOString().slice(0, 10);
}

/** Customer-facing invoice Date — never falls back to created_at. */
export function resolveInvoicePrintDate(input: {
  issued_at?: string | null;
  period_end?: string | null;
}): string {
  if (input.issued_at) {
    return formatInvoiceDate(input.issued_at);
  }

  const computed = computeInvoiceDateFromPeriodEnd(input.period_end);
  if (computed) {
    return formatInvoiceDate(computed);
  }

  return "—";
}

/** 18h00 / 12h30 — matches shuttle invoice time column */
export function formatInvoiceTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const h = d.getHours();
  const m = d.getMinutes();
  if (m === 0) return `${h}h00`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** R300.00 / R3,300.00 — dot decimals like the shuttle invoice PDF */
export function formatZarAmount(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "R—";
  const [whole, fraction = "00"] = n.toFixed(2).split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `R${groupedWhole}.${fraction}`;
}

export function formatInvoicePeriod(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  return `${formatInvoiceDate(start)} - ${formatInvoiceDate(end)}`;
}
