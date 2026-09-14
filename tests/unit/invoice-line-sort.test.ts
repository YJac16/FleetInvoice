import { describe, expect, it } from "vitest";

import {
  compareInvoiceLinesChronologically,
  getInvoiceLineSortTimestamp,
  sortInvoiceLinesChronologically,
} from "@/features/invoices/lib/invoice-line-sort";
import { buildInvoicePrintRows } from "@/features/invoices/lib/invoice-print-rows";
import type { InvoiceLineWithTrip } from "@/services/invoices.service";

function tripLine(
  overrides: Partial<InvoiceLineWithTrip> & Pick<InvoiceLineWithTrip, "id">
): InvoiceLineWithTrip {
  return {
    organisation_id: "org-1",
    invoice_id: "inv-1",
    line_type: "trip",
    fuel_fillup_id: null,
    rate_card_id: null,
    trip_id: overrides.id,
    description:
      overrides.description ??
      "01/09/2026 08:00 | Acme Corp | 1 pax | Central",
    quantity: 1,
    unit_price: 300,
    amount: 300,
    created_at: "2026-09-01T08:00:00.000Z",
    trips: {
      id: overrides.id,
      planned_start: "2026-09-01T06:00:00.000Z",
      notes: null,
    },
    ...overrides,
  };
}

describe("getInvoiceLineSortTimestamp", () => {
  it("prefers embedded trip planned_start over description", () => {
    const line = tripLine({
      id: "line-a",
      description: "31/08/2026 18:00 | Lewis Head Office | 1 pax | Central",
      trips: {
        id: "line-a",
        planned_start: "2026-08-31T16:00:00.000Z",
        notes: null,
      },
    });

    expect(getInvoiceLineSortTimestamp(line)).toBe(
      new Date("2026-08-31T16:00:00.000Z").getTime()
    );
  });

  it("parses DD/MM/YYYY pipe descriptions without lexicographic mistakes", () => {
    const line = tripLine({
      id: "line-b",
      trips: null,
      description: "02/09/2026 07:30 | Beta Ltd | 2 pax | North",
    });

    const timestamp = getInvoiceLineSortTimestamp(line);
    expect(timestamp).toBe(new Date(2026, 8, 2, 7, 30).getTime());
  });
});

describe("sortInvoiceLinesChronologically", () => {
  it("orders mixed companies by trip date then time ascending", () => {
    const lines = [
      tripLine({
        id: "later-same-day",
        description: "01/09/2026 18:00 | Beta Ltd | 1 pax | South",
        created_at: "2026-09-01T18:00:00.000Z",
        trips: {
          id: "later-same-day",
          planned_start: "2026-09-01T16:00:00.000Z",
          notes: null,
        },
      }),
      tripLine({
        id: "earlier-day",
        description: "31/08/2026 19:00 | Acme Corp | 1 pax | Central",
        created_at: "2026-09-01T08:00:00.000Z",
        trips: {
          id: "earlier-day",
          planned_start: "2026-08-31T17:00:00.000Z",
          notes: null,
        },
      }),
      tripLine({
        id: "earlier-same-day",
        description: "01/09/2026 07:00 | Gamma Inc | 3 pax | East",
        created_at: "2026-09-01T07:00:00.000Z",
        trips: {
          id: "earlier-same-day",
          planned_start: "2026-09-01T05:00:00.000Z",
          notes: null,
        },
      }),
    ];

    expect(sortInvoiceLinesChronologically(lines).map((line) => line.id)).toEqual([
      "earlier-day",
      "earlier-same-day",
      "later-same-day",
    ]);
  });

  it("uses line id as a stable tie-breaker for identical timestamps", () => {
    const sharedStart = "2026-09-01T08:00:00.000Z";
    const lines = [
      tripLine({
        id: "line-z",
        created_at: sharedStart,
        trips: { id: "line-z", planned_start: sharedStart, notes: null },
      }),
      tripLine({
        id: "line-a",
        created_at: sharedStart,
        trips: { id: "line-a", planned_start: sharedStart, notes: null },
      }),
    ];

    expect(sortInvoiceLinesChronologically(lines).map((line) => line.id)).toEqual([
      "line-a",
      "line-z",
    ]);
  });

  it("keeps non-trip lines at the end ordered by created_at", () => {
    const lines: InvoiceLineWithTrip[] = [
      {
        id: "fuel-late",
        organisation_id: "org-1",
        invoice_id: "inv-1",
        line_type: "fuel",
        fuel_fillup_id: "fill-2",
        rate_card_id: null,
        trip_id: null,
        description: "Fuel top-up",
        quantity: 1,
        unit_price: 50,
        amount: 50,
        created_at: "2026-09-02T10:00:00.000Z",
      },
      tripLine({
        id: "trip-first",
        trips: {
          id: "trip-first",
          planned_start: "2026-09-01T06:00:00.000Z",
          notes: null,
        },
      }),
      {
        id: "fuel-early",
        organisation_id: "org-1",
        invoice_id: "inv-1",
        line_type: "adjustment",
        fuel_fillup_id: null,
        rate_card_id: null,
        trip_id: null,
        description: "Weekend surcharge",
        quantity: 1,
        unit_price: 25,
        amount: 25,
        created_at: "2026-09-02T08:00:00.000Z",
      },
    ];

    expect(sortInvoiceLinesChronologically(lines).map((line) => line.id)).toEqual([
      "trip-first",
      "fuel-early",
      "fuel-late",
    ]);
  });
});

describe("buildInvoicePrintRows", () => {
  it("assigns line numbers after chronological sorting", () => {
    const rows = buildInvoicePrintRows([
      tripLine({
        id: "line-2",
        description: "01/09/2026 18:00 | Beta Ltd | 1 pax | South",
        trips: {
          id: "line-2",
          planned_start: "2026-09-01T16:00:00.000Z",
          notes: null,
        },
      }),
      tripLine({
        id: "line-1",
        description: "31/08/2026 19:00 | Acme Corp | 1 pax | Central",
        trips: {
          id: "line-1",
          planned_start: "2026-08-31T17:00:00.000Z",
          notes: null,
        },
      }),
    ]);

    expect(rows.map((row) => row.lineNumber)).toEqual([1, 2]);
    expect(rows[0]?.date).toBe("31/08/2026");
    expect(rows[1]?.date).toBe("01/09/2026");
  });
});

describe("compareInvoiceLinesChronologically", () => {
  it("does not sort by company name when timestamps differ", () => {
    const acmeLater = tripLine({
      id: "acme",
      description: "02/09/2026 08:00 | Acme Corp | 1 pax | Central",
      trips: {
        id: "acme",
        planned_start: "2026-09-02T06:00:00.000Z",
        notes: null,
      },
    });
    const betaEarlier = tripLine({
      id: "beta",
      description: "01/09/2026 18:00 | Beta Ltd | 1 pax | South",
      trips: {
        id: "beta",
        planned_start: "2026-09-01T16:00:00.000Z",
        notes: null,
      },
    });

    expect(compareInvoiceLinesChronologically(acmeLater, betaEarlier)).toBeGreaterThan(0);
  });
});
