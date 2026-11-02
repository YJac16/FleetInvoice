import { describe, expect, it } from "vitest";

import {
  latestTripRateCard,
  defaultEffectiveFromDate,
} from "@/features/companies/lib/company-trip-rate";
import type { RateCard } from "@/types";

describe("company trip rate helpers", () => {
  it("picks the latest effective trip rate card for a company", () => {
    const cards = [
      {
        id: "1",
        line_type: "trip",
        deleted_at: null,
        company_id: "co",
        effective_from: "2026-01-01",
        unit_amount: 300,
      },
      {
        id: "2",
        line_type: "trip",
        deleted_at: null,
        company_id: "co",
        effective_from: "2026-09-01",
        unit_amount: 440,
      },
    ] as RateCard[];
    expect(latestTripRateCard(cards)?.id).toBe("2");
  });

  it("returns ISO date for default effective from", () => {
    expect(defaultEffectiveFromDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

import {
  pickDefaultEffectiveFrom,
  tripRateChanged,
} from "@/features/companies/lib/company-trip-rate";

describe("00069 rate edit defaults", () => {
  const now = new Date("2026-11-02T23:30:00Z"); // 3 Nov 01:30 SAST

  it("defaults effective-from to the earliest unbilled trip date", () => {
    expect(pickDefaultEffectiveFrom("2026-09-24", now)).toBe("2026-09-24");
  });

  it("falls back to today in SAST, not UTC", () => {
    expect(pickDefaultEffectiveFrom(null, now)).toBe("2026-11-03");
    expect(defaultEffectiveFromDate(now)).toBe("2026-11-03");
  });

  it("does not resend an unchanged rate", () => {
    const latest = { unit_amount: 440, effective_from: "2026-09-01" };
    expect(tripRateChanged(latest, 440, "2026-09-01")).toBe(false);
    expect(tripRateChanged(latest, 450, "2026-09-01")).toBe(true);
    expect(tripRateChanged(latest, 440, "2026-08-01")).toBe(true);
    expect(tripRateChanged(null, 440, "2026-09-01")).toBe(true);
  });
});
