import type { InvoiceLine } from "@/types";

import {
  formatInvoiceDate,
  formatInvoiceTime,
  formatZarAmount,
} from "@/features/invoices/lib/invoice-print-format";

export type InvoiceVehicleEmbed = {
  name?: string | null;
  registration_number?: string | null;
};

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
        vehicles?: InvoiceVehicleEmbed | InvoiceVehicleEmbed[] | null;
      }[]
    | null;
};

export type InvoiceFuelEmbed = {
  id: string;
  filled_at: string;
  odometer_km: number;
  drivers?: { full_name: string } | { full_name: string }[] | null;
  vehicles?: InvoiceVehicleEmbed | InvoiceVehicleEmbed[] | null;
};

export type InvoicePrintRow = {
  lineNumber: number;
  date: string;
  time: string;
  company: string;
  pax: string;
  area: string;
  driver: string;
  vehicle: string;
  amount: string;
  lineType: InvoiceLine["line_type"];
};

function firstRecord<T>(embed: T | T[] | null | undefined): T | null {
  if (!embed) return null;
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

function firstName<T extends { name?: string | null }>(
  embed: T | T[] | null | undefined
): string | null {
  return firstRecord(embed)?.name?.trim() || null;
}

export function firstDriverName(
  assignments: InvoiceTripEmbed["trip_assignments"]
): string | null {
  if (!assignments?.length) return null;
  for (const assignment of assignments) {
    const row = firstRecord(assignment.drivers);
    if (row?.full_name?.trim()) return row.full_name.trim();
  }
  return null;
}

export function firstAssignmentVehicleLabel(
  assignments: InvoiceTripEmbed["trip_assignments"]
): string | null {
  if (!assignments?.length) return null;
  for (const assignment of assignments) {
    const label = formatVehicleEmbed(assignment.vehicles);
    if (label) return label;
  }
  return null;
}

export function formatVehicleEmbed(
  embed: InvoiceVehicleEmbed | InvoiceVehicleEmbed[] | null | undefined
): string | null {
  const row = firstRecord(embed);
  if (!row) return null;
  return row.registration_number?.trim() || row.name?.trim() || null;
}

export function firstFuelDriverName(
  drivers: InvoiceFuelEmbed["drivers"]
): string | null {
  return firstRecord(drivers)?.full_name?.trim() || null;
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
    driver: firstDriverName(trip.trip_assignments) || "—",
    vehicle: firstAssignmentVehicleLabel(trip.trip_assignments) || "—",
    amount: formatZarAmount(line.amount),
    lineType: line.line_type,
  };
}

export function buildFuelPrintRow(
  line: InvoiceLine,
  fillup: InvoiceFuelEmbed,
  lineNumber: number
): InvoicePrintRow {
  return {
    lineNumber,
    date: formatInvoiceDate(fillup.filled_at),
    time: formatInvoiceTime(fillup.filled_at),
    company: "—",
    pax: "—",
    area: line.description,
    driver: firstFuelDriverName(fillup.drivers) || "—",
    vehicle: formatVehicleEmbed(fillup.vehicles) || "—",
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
    driver: "—",
    vehicle: "—",
    amount: formatZarAmount(line.amount),
    lineType: line.line_type,
  };
}

export function uniqueLabels(values: Array<string | null | undefined>): string[] {
  const names = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && trimmed !== "—") names.add(trimmed);
  }
  return [...names];
}

export function formatLabelList(values: string[]): string {
  return values.length ? values.join(", ") : "—";
}

export function resolveDriverLabel(
  settingsLabel: string | undefined,
  trips: InvoiceTripEmbed[],
  extraNames: Array<string | null | undefined> = []
): string {
  if (settingsLabel?.trim()) return settingsLabel.trim();
  const names = uniqueLabels([
    ...trips.map((trip) => firstDriverName(trip.trip_assignments)),
    ...extraNames,
  ]);
  return formatLabelList(names);
}

export function resolveVehicleLabel(
  trips: InvoiceTripEmbed[],
  extraLabels: Array<string | null | undefined> = []
): string {
  const labels = uniqueLabels([
    ...trips.map((trip) => firstAssignmentVehicleLabel(trip.trip_assignments)),
    ...extraLabels,
  ]);
  return formatLabelList(labels);
}
