import { weekPeriodEnd } from "@/features/invoices/lib/week";
import { computeInvoiceDateFromPeriodEnd } from "@/features/invoices/lib/invoice-print-format";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatShortDate(dateOnly: string): string {
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dateOnly;
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Human label for Mon–Sun service week from period_start (inclusive period_end). */
export function formatServiceWeekLabel(periodStart: string): string {
  const periodEnd = weekPeriodEnd(periodStart);
  return `Week of ${formatShortDate(periodStart)} – ${formatShortDate(periodEnd)}`;
}

/** Invoice date shown on print = Monday after the service week. */
export function formatInvoiceDatePreview(periodStart: string): string {
  const periodEnd = weekPeriodEnd(periodStart);
  const invoiceDate = computeInvoiceDateFromPeriodEnd(periodEnd);
  return invoiceDate ? formatShortDate(invoiceDate) : "—";
}
