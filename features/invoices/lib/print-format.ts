import { INVOICE_TIMEZONE } from "@/features/invoices/lib/week";

/** DD/MM/YYYY in SAST. */
export function formatDateSlash(isoOrYmd: string): string {
  const d = isoOrYmd.length === 10 ? `${isoOrYmd}T12:00:00+02:00` : isoOrYmd;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: INVOICE_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  return `${day}/${month}/${year}`;
}

/** Trip time as 18h00 in SAST. */
export function formatTimeSast(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: INVOICE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}h${minute}`;
}

/** Calendar date YYYY-MM-DD in SAST from ISO timestamptz. */
export function ymdFromIsoSast(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INVOICE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** R3,300.00 style amount. */
export function formatAmountRand(amount: number): string {
  return `R${amount.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function driverFirstNameUpper(fullName: string | null | undefined): string {
  if (!fullName?.trim()) return "";
  return fullName.trim().split(/\s+/)[0]!.toUpperCase();
}

export type TripInvoiceTableRow = {
  no: number;
  date: string;
  showDate: boolean;
  time: string;
  company: string;
  pax: string;
  area: string;
  amount: string;
};

/** Build numbered rows with blank date cells for same calendar day. */
export function buildTripInvoiceTableRows(
  lines: Array<{
    plannedStart: string;
    company: string | null;
    pax: number | null;
    area: string | null;
    amount: number;
  }>
): TripInvoiceTableRow[] {
  let prevYmd = "";
  return lines.map((line, index) => {
    const ymd = ymdFromIsoSast(line.plannedStart);
    const showDate = ymd !== prevYmd;
    prevYmd = ymd;
    return {
      no: index + 1,
      date: formatDateSlash(ymd),
      showDate,
      time: formatTimeSast(line.plannedStart),
      company: line.company ?? "",
      pax: line.pax != null ? String(line.pax) : "",
      area: line.area ?? "",
      amount: formatAmountRand(line.amount),
    };
  });
}
