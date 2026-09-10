import { STAFF_TRANSPORT_FLAT_RATE_ZAR } from "@/lib/constants";

function sastParts(iso: string) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: get("day"),
    month: get("month"),
    year: get("year"),
    hours: get("hour"),
    minutes: get("minute"),
  };
}

/** Matches SQL `staff_trip_invoice_description`. */
export function staffTripInvoiceDescription(input: {
  plannedStart: string;
  companyLabel: string;
  paxCount: number | null;
  areaName: string;
}): string {
  const p = sastParts(input.plannedStart);
  const pax = input.paxCount != null && input.paxCount >= 0 ? input.paxCount : 0;
  return `${p.day}/${p.month}/${p.year} ${p.hours}:${p.minutes} | ${input.companyLabel} | ${pax} pax | ${input.areaName}`;
}

export function staffTripInvoiceAmount(rateCardAmount?: number | null): number {
  if (rateCardAmount != null && Number.isFinite(rateCardAmount) && rateCardAmount > 0) {
    return Math.round(rateCardAmount * 100) / 100;
  }
  return STAFF_TRANSPORT_FLAT_RATE_ZAR;
}
