import type { InvoiceLine } from "@/types";

import {
  buildNonTripPrintRow,
  buildTripPrintRow,
  type InvoiceTripEmbed,
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
    return buildNonTripPrintRow(line, lineNumber);
  });
}

export type { InvoiceTripEmbed };
