import { describe, expect, it } from "vitest";

import { STAFF_TRANSPORT_FLAT_RATE_ZAR } from "@/lib/constants";
import {
  staffTripInvoiceAmount,
  staffTripInvoiceDescription,
} from "@/features/invoices/lib/staff-trip-invoice";

describe("staffTripInvoiceDescription", () => {
  it("matches the pipe format used on invoice print", () => {
    expect(
      staffTripInvoiceDescription({
        plannedStart: "2026-09-10T16:00:00+02:00",
        companyLabel: "Lewis Compliance",
        paxCount: 3,
        areaName: "Bellville",
      })
    ).toBe("10/09/2026 16:00 | Lewis Compliance | 3 pax | Bellville");
  });
});

describe("staffTripInvoiceAmount", () => {
  it("uses the flat rate when no rate card", () => {
    expect(staffTripInvoiceAmount()).toBe(STAFF_TRANSPORT_FLAT_RATE_ZAR);
  });

  it("prefers a positive rate-card amount", () => {
    expect(staffTripInvoiceAmount(350)).toBe(350);
  });
});
