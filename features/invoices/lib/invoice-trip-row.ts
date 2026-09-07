import type { InvoiceLine } from "@/types";

import {
  parseInvoiceLineDescription,
  sanitizeInvoiceArea,
} from "@/features/invoices/lib/invoice-line-description";
import {
  formatInvoiceDate,
  formatInvoiceTime,
  formatZarAmount,
} from "@/features/invoices/lib/invoice-print-format";

export type InvoiceTripEmbed = {
  id: string;
  planned_start: string;
  notes: string | null;
  service_locations?: string | null;
  companies?: { name: string } | { name: string }[] | null;
  routes?: { name: string } | { name: string }[] | null;
  trip_passengers?: { id: string; status: string }[] | null;
  trip_assignments?:
    | {
        drivers?: { full_name: string } | { full_name: string }[] | null;
        vehicles?:
          | { registration_number: string | null }
          | { registration_number: string | null }[]
          | null;
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

function firstVehicleRegistration(
  assignments: InvoiceTripEmbed["trip_assignments"]
): string | null {
  if (!assignments?.length) return null;
  for (const assignment of assignments) {
    const vehicles = assignment.vehicles;
    const row = Array.isArray(vehicles) ? vehicles[0] : vehicles;
    const reg = row?.registration_number?.trim();
    if (reg) return reg;
  }
  return null;
}

function countPax(passengers: InvoiceTripEmbed["trip_passengers"]): number {
  if (!passengers?.length) return 0;
  return passengers.filter((p) => p.status !== "cancelled").length;
}

function resolvePax(
  parsedPax: number | null | undefined,
  tripPassengerCount: number
): string {
  if (parsedPax != null && parsedPax > 0) return String(parsedPax);
  if (tripPassengerCount > 0) return String(tripPassengerCount);
  return "—";
}

export function buildTripPrintRow(
  line: InvoiceLine,
  trip: InvoiceTripEmbed,
  lineNumber: number
): InvoicePrintRow {
  const parsed = parseInvoiceLineDescription(line.description);
  const paxCount = countPax(trip.trip_passengers);

  if (parsed) {
    return {
      lineNumber,
      date: parsed.date,
      time: parsed.time,
      company: parsed.company,
      pax: resolvePax(parsed.pax, paxCount),
      area: parsed.area,
      amount: formatZarAmount(line.amount),
      lineType: line.line_type,
    };
  }

  const company = firstName(trip.companies) || "—";
  const rawArea =
    trip.service_locations?.trim() ||
    firstName(trip.routes) ||
    trip.notes?.trim() ||
    line.description.replace(/^Completed trip\s+/i, "") ||
    "—";
  const area =
    rawArea === "—"
      ? rawArea
      : sanitizeInvoiceArea(rawArea, company === "—" ? undefined : company) ||
        "—";

  return {
    lineNumber,
    date: formatInvoiceDate(trip.planned_start),
    time: formatInvoiceTime(trip.planned_start),
    company,
    pax: resolvePax(null, paxCount),
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

export function resolveVehicleReg(
  settingsReg: string | undefined,
  trips: InvoiceTripEmbed[]
): string | null {
  if (settingsReg?.trim()) return settingsReg.trim();
  const regs = new Set<string>();
  for (const trip of trips) {
    const reg = firstVehicleRegistration(trip.trip_assignments);
    if (reg) regs.add(reg);
  }
  if (regs.size === 1) return [...regs][0]!;
  if (regs.size > 1) return "VARIOUS";
  return null;
}
