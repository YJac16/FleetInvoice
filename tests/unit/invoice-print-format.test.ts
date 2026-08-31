import { describe, expect, it } from "vitest";

import {
  formatInvoiceDate,
  formatInvoicePeriod,
  formatInvoiceTime,
  formatZarAmount,
} from "@/features/invoices/lib/invoice-print-format";
import { buildTripPrintRow } from "@/features/invoices/lib/invoice-trip-row";
import type { InvoiceLine } from "@/types";

describe("invoice print formatters", () => {
  it("formats dates as dd/MM/yyyy", () => {
    expect(formatInvoiceDate("2026-08-17T16:00:00.000Z")).toMatch(/17\/08\/2026/);
  });

  it("formats times as 18h00 / 12h30", () => {
    expect(
      formatInvoiceTime(new Date(2026, 7, 17, 18, 0).toISOString())
    ).toBe("18h00");
    expect(
      formatInvoiceTime(new Date(2026, 7, 22, 12, 30).toISOString())
    ).toBe("12h30");
  });

  it("formats ZAR amounts like the shuttle PDF", () => {
    expect(formatZarAmount(300)).toBe("R300.00");
    expect(formatZarAmount(3300)).toBe("R3,300.00");
  });

  it("formats service periods", () => {
    expect(
      formatInvoicePeriod("2026-08-17", "2026-08-23")
    ).toBe("17/08/2026 - 23/08/2026");
  });
});

describe("buildTripPrintRow", () => {
  const line = {
    id: "line-1",
    organisation_id: "org",
    invoice_id: "inv",
    line_type: "trip",
    fuel_fillup_id: null,
    rate_card_id: null,
    trip_id: "trip-1",
    description: "Completed trip",
    quantity: 1,
    unit_price: 300,
    amount: 300,
    created_at: "2026-08-24T00:00:00.000Z",
  } satisfies InvoiceLine;

  it("maps trip embeds to shuttle invoice columns", () => {
    const row = buildTripPrintRow(
      line,
      {
        id: "trip-1",
        planned_start: new Date(2026, 7, 17, 18, 0).toISOString(),
        notes: null,
        companies: { name: "Lewis Compliance" },
        routes: { name: "Woodstock and Town" },
        trip_passengers: [
          { id: "1", status: "boarded" },
          { id: "2", status: "boarded" },
          { id: "3", status: "boarded" },
          { id: "4", status: "boarded" },
        ],
        trip_assignments: [
          { drivers: { full_name: "Yaseen Jacobs" } },
        ],
      },
      1
    );

    expect(row.lineNumber).toBe(1);
    expect(row.date).toMatch(/17\/08\/2026/);
    expect(row.time).toBe("18h00");
    expect(row.company).toBe("Lewis Compliance");
    expect(row.pax).toBe("4");
    expect(row.area).toBe("Woodstock and Town");
    expect(row.amount).toBe("R300.00");
  });
});
