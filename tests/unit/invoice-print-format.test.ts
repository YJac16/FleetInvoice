import { describe, expect, it } from "vitest";

import {
  formatInvoiceDate,
  formatInvoicePeriod,
  formatInvoiceTime,
  formatZarAmount,
} from "@/features/invoices/lib/invoice-print-format";
import {
  buildInvoicePrintRows,
  collectInvoiceParties,
} from "@/features/invoices/lib/invoice-print-rows";
import {
  buildFuelPrintRow,
  buildTripPrintRow,
  resolveDriverLabel,
} from "@/features/invoices/lib/invoice-trip-row";
import type { InvoiceLineWithTrip } from "@/services/invoices.service";
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

  it("maps trip embeds to shuttle invoice columns including driver and vehicle", () => {
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
          {
            drivers: { full_name: "Yaseen Jacobs" },
            vehicles: { name: "Suzuki XL6", registration_number: "02220WP" },
          },
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
    expect(row.driver).toBe("Yaseen Jacobs");
    expect(row.vehicle).toBe("02220WP");
    expect(row.amount).toBe("R300.00");
  });
});

describe("buildFuelPrintRow", () => {
  const line = {
    id: "line-2",
    organisation_id: "org",
    invoice_id: "inv",
    line_type: "fuel",
    fuel_fillup_id: "fill-1",
    rate_card_id: null,
    trip_id: null,
    description: "Fuel 40 L @ 120000 km (2026-08-18)",
    quantity: 40,
    unit_price: 20,
    amount: 800,
    created_at: "2026-08-24T00:00:00.000Z",
  } satisfies InvoiceLine;

  it("uses fill-up driver, vehicle, and filled_at", () => {
    const row = buildFuelPrintRow(
      line,
      {
        id: "fill-1",
        filled_at: new Date(2026, 7, 18, 9, 0).toISOString(),
        odometer_km: 120000,
        drivers: { full_name: "Shaheed J" },
        vehicles: { name: "Suzuki XL6", registration_number: "02220WP" },
      },
      2
    );
    expect(row.driver).toBe("Shaheed J");
    expect(row.vehicle).toBe("02220WP");
    expect(row.date).toMatch(/18\/08\/2026/);
    expect(row.area).toContain("Fuel 40 L");
  });
});

describe("invoice parties", () => {
  it("lists every driver instead of VARIOUS", () => {
    expect(
      resolveDriverLabel(undefined, [
        {
          id: "t1",
          planned_start: "2026-08-17T16:00:00.000Z",
          notes: null,
          trip_assignments: [{ drivers: { full_name: "Yaseen Jacobs" } }],
        },
        {
          id: "t2",
          planned_start: "2026-08-18T16:00:00.000Z",
          notes: null,
          trip_assignments: [{ drivers: { full_name: "Shaheed J" } }],
        },
      ])
    ).toBe("Yaseen Jacobs, Shaheed J");
  });

  it("collects drivers and vehicles from trip and fuel lines", () => {
    const lines = [
      {
        id: "l1",
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
        trips: {
          id: "trip-1",
          planned_start: "2026-08-17T16:00:00.000Z",
          notes: null,
          trip_assignments: [
            {
              drivers: { full_name: "Yaseen Jacobs" },
              vehicles: { registration_number: "GR 11 WP" },
            },
          ],
        },
      },
      {
        id: "l2",
        organisation_id: "org",
        invoice_id: "inv",
        line_type: "fuel",
        fuel_fillup_id: "fill-1",
        rate_card_id: null,
        trip_id: null,
        description: "Fuel",
        quantity: 1,
        unit_price: 100,
        amount: 100,
        created_at: "2026-08-24T00:00:00.000Z",
        fuel_fillups: {
          id: "fill-1",
          filled_at: "2026-08-18T08:00:00.000Z",
          odometer_km: 1000,
          drivers: { full_name: "Yaseen Jacobs" },
          vehicles: { registration_number: "02220WP" },
        },
      },
    ] satisfies InvoiceLineWithTrip[];

    const parties = collectInvoiceParties(lines);
    expect(parties.drivers).toEqual(["Yaseen Jacobs"]);
    expect(parties.vehicles).toEqual(["GR 11 WP", "02220WP"]);
    expect(buildInvoicePrintRows(lines)).toHaveLength(2);
  });
});
