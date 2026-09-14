import { describe, expect, it } from "vitest";

import {
  compareInvoicesByPeriodEnd,
  filterAndSortInvoices,
  matchesInvoiceStatusFilter,
  matchesInvoiceWeekFilter,
} from "@/features/invoices/lib/invoice-list-filters";
import type { Invoice } from "@/types";

function invoice(
  overrides: Partial<Invoice> & Pick<Invoice, "id" | "period_start" | "period_end" | "status">
): Invoice {
  return {
    organisation_id: "org",
    company_id: "co",
    driver_id: null,
    trip_company: null,
    currency: "ZAR",
    subtotal: 0,
    total: 0,
    notes: null,
    generated_by: null,
    issued_at: null,
    paid_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("invoice list filters", () => {
  const now = new Date("2026-09-14T12:00:00Z"); // Monday → service week starts 2026-09-14

  it("matches this week by period_start Monday", () => {
    expect(
      matchesInvoiceWeekFilter(
        { period_start: "2026-09-14" },
        "this_week",
        now
      )
    ).toBe(true);
    expect(
      matchesInvoiceWeekFilter(
        { period_start: "2026-09-07" },
        "this_week",
        now
      )
    ).toBe(false);
  });

  it("matches last 4 weeks including current week", () => {
    expect(
      matchesInvoiceWeekFilter(
        { period_start: "2026-08-24" },
        "last_4_weeks",
        now
      )
    ).toBe(true);
    expect(
      matchesInvoiceWeekFilter(
        { period_start: "2026-08-17" },
        "last_4_weeks",
        now
      )
    ).toBe(false);
  });

  it("filters by status", () => {
    expect(matchesInvoiceStatusFilter({ status: "draft" }, "draft")).toBe(true);
    expect(matchesInvoiceStatusFilter({ status: "paid" }, "issued")).toBe(false);
  });

  it("sorts newest first by period_end desc", () => {
    const rows = [
      invoice({
        id: "a",
        period_start: "2026-09-01",
        period_end: "2026-09-08",
        status: "draft",
      }),
      invoice({
        id: "b",
        period_start: "2026-09-08",
        period_end: "2026-09-15",
        status: "draft",
      }),
    ];

    expect(compareInvoicesByPeriodEnd(rows[0], rows[1], "newest")).toBeGreaterThan(
      0
    );
    expect(filterAndSortInvoices(rows, {
      sortOrder: "newest",
      weekFilter: "all",
      statusFilter: "all",
    }).map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("combines week and status filters", () => {
    const rows = [
      invoice({
        id: "this-draft",
        period_start: "2026-09-14",
        period_end: "2026-09-21",
        status: "draft",
      }),
      invoice({
        id: "this-issued",
        period_start: "2026-09-14",
        period_end: "2026-09-21",
        status: "issued",
      }),
      invoice({
        id: "old-draft",
        period_start: "2026-09-01",
        period_end: "2026-09-08",
        status: "draft",
      }),
    ];

    const filtered = filterAndSortInvoices(
      rows,
      {
        sortOrder: "newest",
        weekFilter: "this_week",
        statusFilter: "draft",
      },
      now
    );

    expect(filtered.map((row) => row.id)).toEqual(["this-draft"]);
  });
});
