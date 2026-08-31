import type { InvoiceLine } from "@/types";

import {
  formatInvoiceDate,
  formatInvoiceTime,
  formatZarAmount,
} from "@/features/invoices/lib/invoice-print-format";

export type InvoiceTripEmbed = {
  id: string;
  planned_start: string;
  notes: string | null;
  companies?: { name: string } | { name: string }[] | null;
  routes?: { name: string } | { name: string }[] | null;
  trip_passengers?: { id: string; status: string }[] | null;
  trip_assignments?:
    | {
        drivers?: { full_name: string } | { full_name: string }[] | null;
      }[]
    | null;
};

export type InvoicePrintRow = {
  lineNumber: number;
  date: string;
  time: string;
  company: string;
  pax: string;
  area: string;
  amount: string;
  lineType: InvoiceLine["line_type"];
};

function firstName<T extends { name?: string | null }>(
  embed: T | T[] | null | undefined
): string | null {
  if (!embed) return null;
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.name?.trim() || null;
}

function firstDriverName(
  assignments: InvoiceTripEmbed["trip_assignments"]
): string | null {
  if (!assignments?.length) return null;
  for (const assignment of assignments) {
    const drivers = assignment.drivers;
    const row = Array.isArray(drivers) ? drivers[0] : drivers;
    if (row?.full_name?.trim()) return row.full_name.trim();
  }
  return null;
}

function countPax(passengers: InvoiceTripEmbed["trip_passengers"]): number {
  if (!passengers?.length) return 0;
  return passengers.filter((p) => p.status !== "cancelled").length;
}

export function buildTripPrintRow(
  line: InvoiceLine,
  trip: InvoiceTripEmbed,
  lineNumber: number
): InvoicePrintRow {
  const paxCount = countPax(trip.trip_passengers);
  const area =
    firstName(trip.routes) ||
    trip.notes?.trim() ||
    line.description.replace(/^Completed trip\s+/i, "") ||
    "—";

  return {
    lineNumber,
    date: formatInvoiceDate(trip.planned_start),
    time: formatInvoiceTime(trip.planned_start),
    company: firstName(trip.companies) || "—",
    pax: paxCount > 0 ? String(paxCount) : "—",
    area,
    amount: formatZarAmount(line.amount),
    lineType: line.line_type,
  };
}

export function buildNonTripPrintRow(
  line: InvoiceLine,
  lineNumber: number
): InvoicePrintRow {
  return {
    lineNumber,
    date: "—",
    time: "—",
    company: "—",
    pax: "—",
    area: line.description,
    amount: formatZarAmount(line.amount),
    lineType: line.line_type,
  };
}

export function resolveDriverLabel(
  settingsLabel: string | undefined,
  trips: InvoiceTripEmbed[]
): string {
  if (settingsLabel?.trim()) return settingsLabel.trim().toUpperCase();
  const names = new Set<string>();
  for (const trip of trips) {
    const name = firstDriverName(trip.trip_assignments);
    if (name) names.add(name.split(/\s+/)[0]?.toUpperCase() ?? name.toUpperCase());
  }
  if (names.size === 1) return [...names][0]!;
  if (names.size > 1) return "VARIOUS";
  return "—";
}
