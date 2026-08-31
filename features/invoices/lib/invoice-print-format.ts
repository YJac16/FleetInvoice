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
