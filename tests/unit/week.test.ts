import { describe, expect, it } from "vitest";

import {
  INVOICE_TZ,
  isFilledAtInWeek,
  mondayOfWeek,
  weekPeriodEnd,
  weekPeriodUpperBoundExclusive,
} from "@/features/invoices/lib/week";

describe("invoice week window (Africa/Johannesburg)", () => {
  it("resolves Monday for mid-week dates in SAST", () => {
    expect(mondayOfWeek(new Date("2026-09-23T10:00:00+02:00"))).toBe(
      "2026-09-21"
    );
  });

  it("treats Sunday as end of the same Mon–Sun week in SAST", () => {
    expect(mondayOfWeek(new Date("2026-09-27T20:00:00+02:00"))).toBe(
      "2026-09-21"
    );
  });

  it("uses Monday SAST when UTC calendar is still Sunday evening", () => {
    // Mon 00:30 SAST = Sun 22:30 UTC → week starting 2026-09-28
    expect(mondayOfWeek(new Date("2026-09-27T22:30:00Z"))).toBe("2026-09-28");
  });

  it("period end is inclusive Sunday (week_start + 6 days)", () => {
    expect(weekPeriodEnd("2026-09-21")).toBe("2026-09-27");
    expect(weekPeriodEnd("2026-07-20")).toBe("2026-07-26");
  });

  it("Mon–Sun service week spans seven calendar dates", () => {
    const start = "2026-09-21";
    const end = weekPeriodEnd(start);
    expect(end).toBe("2026-09-27");
    const startMs = new Date(`${start}T00:00:00.000Z`).getTime();
    const endMs = new Date(`${end}T00:00:00.000Z`).getTime();
    const daySpan = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
    expect(daySpan + 1).toBe(7);
  });

  it("exclusive upper bound is next Monday 00:00 SAST for inclusive Sunday end", () => {
    const upper = weekPeriodUpperBoundExclusive("2026-09-21", "2026-09-27");
    expect(upper.format("YYYY-MM-DD HH:mm Z")).toBe("2026-09-28 00:00 +02:00");
  });

  it("accepts legacy exclusive Monday period_end for upper bound", () => {
    const upper = weekPeriodUpperBoundExclusive("2026-09-21", "2026-09-28");
    expect(upper.format("YYYY-MM-DD HH:mm Z")).toBe("2026-09-28 00:00 +02:00");
  });

  it("includes filled_at on Sunday SAST and excludes next Monday", () => {
    const weekStart = "2026-09-21";
    expect(
      isFilledAtInWeek("2026-09-21T06:00:00+02:00", weekStart)
    ).toBe(true);
    expect(
      isFilledAtInWeek("2026-09-27T23:59:59+02:00", weekStart)
    ).toBe(true);
    expect(
      isFilledAtInWeek("2026-09-28T00:00:00+02:00", weekStart)
    ).toBe(false);
  });

  it("uses SAST timezone constant", () => {
    expect(INVOICE_TZ).toBe("Africa/Johannesburg");
  });
});
