import { describe, expect, it } from "vitest";

import {
  buildTripInvoiceTableRows,
  formatDateSlash,
  formatTimeSast,
} from "@/features/invoices/lib/print-format";
import {
  addDaysYmd,
  defaultServiceWeekMonday,
  invoiceDateFromWeekStart,
  mondayOfWeekYmd,
  serviceWeekSunday,
  sastStartInstant,
  weekPeriodEnd,
  weekdayInSast,
  ymdInSast,
} from "@/features/invoices/lib/week";

describe("invoice week window (SAST)", () => {
  it("resolves Monday for mid-week dates in SAST", () => {
    // Wednesday 2026-08-26 SAST → Monday 2026-08-24
    expect(mondayOfWeekYmd("2026-08-26")).toBe("2026-08-24");
  });

  it("treats Sunday as end of the Mon–Sun service week", () => {
    expect(mondayOfWeekYmd("2026-08-30")).toBe("2026-08-24");
    expect(serviceWeekSunday("2026-08-24")).toBe("2026-08-30");
  });

  it("period end is exclusive next Monday (invoice date)", () => {
    expect(weekPeriodEnd("2026-08-24")).toBe("2026-08-31");
    expect(invoiceDateFromWeekStart("2026-08-24")).toBe("2026-08-31");
  });

  it("defaults to previous week when today is Monday SAST", () => {
    // Monday 2026-08-31 SAST
    const monday = new Date("2026-08-31T08:00:00+02:00");
    expect(weekdayInSast(ymdInSast(monday))).toBe(1);
    expect(defaultServiceWeekMonday(monday)).toBe("2026-08-24");
  });

  it("defaults to current week when today is not Monday SAST", () => {
    // Wednesday 2026-08-26 SAST
    const wed = new Date("2026-08-26T10:00:00+02:00");
    expect(defaultServiceWeekMonday(wed)).toBe("2026-08-24");
  });

  it("SAST instant bounds match RPC example week", () => {
    const start = sastStartInstant("2026-08-24").getTime();
    const end = sastStartInstant("2026-08-31").getTime();
    // Sunday 30 Aug 23:00 SAST included; Monday 31 Aug 00:00 excluded
    expect(new Date("2026-08-30T21:00:00.000Z").getTime()).toBeGreaterThanOrEqual(
      start
    );
    expect(new Date("2026-08-30T21:00:00.000Z").getTime()).toBeLessThan(end);
    expect(new Date("2026-08-30T22:00:00.000Z").getTime()).toBeGreaterThanOrEqual(
      end
    );
  });

  it("addDaysYmd steps calendar days", () => {
    expect(addDaysYmd("2026-08-24", 6)).toBe("2026-08-30");
  });
});

describe("invoice print formatting", () => {
  it("formats DD/MM/YYYY and 18h00 in SAST", () => {
    expect(formatDateSlash("2026-08-24")).toBe("24/08/2026");
    expect(formatTimeSast("2026-08-24T16:00:00.000Z")).toBe("18h00");
  });

  it("blanks repeated date cells on same calendar day", () => {
    const rows = buildTripInvoiceTableRows([
      {
        plannedStart: "2026-08-18T16:00:00.000Z",
        company: "Lewis Compliance",
        pax: 3,
        area: "Woodstock",
        amount: 300,
      },
      {
        plannedStart: "2026-08-18T10:30:00.000Z",
        company: "Teleperformance",
        pax: 2,
        area: "District Six",
        amount: 300,
      },
    ]);
    expect(rows[0]?.showDate).toBe(true);
    expect(rows[1]?.showDate).toBe(false);
    expect(rows[0]?.date).toBe("18/08/2026");
  });
});
