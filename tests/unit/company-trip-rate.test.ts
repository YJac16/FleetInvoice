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
