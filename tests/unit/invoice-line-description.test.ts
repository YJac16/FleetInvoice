import { describe, expect, it } from "vitest";

import {
  parseInvoiceLineDescription,
  sanitizeInvoiceArea,
} from "@/features/invoices/lib/invoice-line-description";
import { buildTripPrintRow } from "@/features/invoices/lib/invoice-trip-row";
import type { InvoiceLine } from "@/types";

describe("sanitizeInvoiceArea", () => {
  it("strips trailing WEX pickup for Head Office trips", () => {
    expect(
      sanitizeInvoiceArea("Central / WEX William St", "Lewis Head Office")
    ).toBe("Central");
    expect(
      sanitizeInvoiceArea("Cape Town CBD / WEX William St", "Lewis Head Office")
    ).toBe("Cape Town CBD");
  });

  it("strips trailing WEX pickup even when company is not Head Office", () => {
    expect(
      sanitizeInvoiceArea("Central / WEX William St", "Lewis Compliance")
    ).toBe("Central");
  });

  it("leaves compliance areas without WEX unchanged", () => {
    expect(
      sanitizeInvoiceArea("Woodstock / Cape Town CBD", "Lewis Compliance")
    ).toBe("Woodstock / Cape Town CBD");
  });
});

describe("parseInvoiceLineDescription", () => {
  it("parses Head Office rows without WEX in AREA", () => {
    expect(
      parseInvoiceLineDescription(
        "31/08/2026 18:00 | Lewis Head Office | 1 pax | Central / WEX William St"
      )
    ).toEqual({
      date: "31/08/2026",
      time: "18h00",
      company: "Lewis Head Office",
      pax: 1,
      area: "Central",
    });

    expect(
      parseInvoiceLineDescription(
        "02/09/2026 18:00 | Lewis Head Office | 1 pax | Cape Town CBD / WEX William St"
      )
    ).toEqual({
      date: "02/09/2026",
      time: "18h00",
      company: "Lewis Head Office",
      pax: 1,
      area: "Cape Town CBD",
    });
  });

  it("parses multi-pax rows and area with slashes", () => {
    expect(
      parseInvoiceLineDescription(
        "31/08/2026 19:00 | Lewis Compliance | 4 pax | Woodstock / Cape Town CBD"
      )
    ).toEqual({
      date: "31/08/2026",
      time: "19h00",
      company: "Lewis Compliance",
      pax: 4,
      area: "Woodstock / Cape Town CBD",
    });
  });

  it("returns null for legacy completed-trip descriptions", () => {
    expect(parseInvoiceLineDescription("Completed trip 2026-08-31 18:00")).toBeNull();
  });
});

describe("buildTripPrintRow pipe descriptions", () => {
  const line = {
    id: "line-1",
    organisation_id: "org",
    invoice_id: "inv",
    line_type: "trip",
    fuel_fillup_id: null,
    rate_card_id: null,
    trip_id: "trip-1",
    description:
      "31/08/2026 18:00 | Lewis Head Office | 1 pax | Central / WEX William St",
    quantity: 1,
    unit_price: 300,
    amount: 300,
    created_at: "2026-08-31T00:00:00.000Z",
  } satisfies InvoiceLine;

  it("uses description segments without WEX pickup in AREA", () => {
    const row = buildTripPrintRow(
      line,
      {
        id: "trip-1",
        planned_start: new Date(2026, 7, 31, 16, 0).toISOString(),
        notes: "Lewis Head Office",
        companies: { name: "WCL Trading CC" },
        routes: { name: "Lewis Head Office" },
        trip_passengers: [],
        trip_assignments: [{ drivers: { full_name: "Yaseen Jacobs" } }],
      },
      1
    );

    expect(row.company).toBe("Lewis Head Office");
    expect(row.pax).toBe("1");
    expect(row.area).toBe("Central");
    expect(row.date).toBe("31/08/2026");
    expect(row.time).toBe("18h00");
    expect(row.amount).toBe("R300.00");
  });

  it("falls back to trip passenger count when description pax is missing", () => {
    const row = buildTripPrintRow(
      {
        ...line,
        description:
          "31/08/2026 19:00 | Teleperformance | passengers | Rondebosch",
      },
      {
        id: "trip-2",
        planned_start: new Date(2026, 7, 31, 17, 0).toISOString(),
        notes: null,
        companies: { name: "WCL Trading CC" },
        routes: { name: "Teleperformance" },
        trip_passengers: [
          { id: "1", status: "boarded" },
          { id: "2", status: "boarded" },
          { id: "3", status: "boarded" },
        ],
        trip_assignments: null,
      },
      2
    );

    expect(row.company).toBe("Teleperformance");
    expect(row.pax).toBe("3");
    expect(row.area).toBe("Rondebosch");
  });
});
