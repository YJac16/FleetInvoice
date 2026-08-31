import {
  buildFuelPrintRow,
  buildNonTripPrintRow,
  buildTripPrintRow,
  formatVehicleEmbed,
  firstFuelDriverName,
  firstAssignmentVehicleLabel,
  firstDriverName,
  uniqueLabels,
} from "@/features/invoices/lib/invoice-trip-row";
import type { InvoiceLineWithTrip } from "@/services/invoices.service";

export type InvoicePrintRow = ReturnType<typeof buildTripPrintRow>;

export function buildInvoicePrintRows(
  lines: InvoiceLineWithTrip[]
): InvoicePrintRow[] {
  return lines.map((line, index) => {
    const lineNumber = index + 1;
    if (line.line_type === "trip" && line.trips) {
      return buildTripPrintRow(line, line.trips, lineNumber);
    }
    if (line.line_type === "fuel" && line.fuel_fillups) {
      return buildFuelPrintRow(line, line.fuel_fillups, lineNumber);
    }
    return buildNonTripPrintRow(line, lineNumber);
  });
}

export function collectInvoiceParties(lines: InvoiceLineWithTrip[]): {
  drivers: string[];
  vehicles: string[];
} {
  const drivers: Array<string | null> = [];
  const vehicles: Array<string | null> = [];

  for (const line of lines) {
    if (line.trips) {
      drivers.push(firstDriverName(line.trips.trip_assignments));
      vehicles.push(firstAssignmentVehicleLabel(line.trips.trip_assignments));
    }
    if (line.fuel_fillups) {
      drivers.push(firstFuelDriverName(line.fuel_fillups.drivers));
      vehicles.push(formatVehicleEmbed(line.fuel_fillups.vehicles));
    }
  }

  return {
    drivers: uniqueLabels(drivers),
    vehicles: uniqueLabels(vehicles),
  };
}
