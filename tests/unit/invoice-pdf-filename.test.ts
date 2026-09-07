import { describe, expect, it } from "vitest";

import {
  buildInvoicePdfFilename,
  formatFilenameDate,
  invoicePdfDocumentTitle,
  resolveDriverFilenameSlug,
  resolveServiceWeekEnd,
} from "@/features/invoices/lib/invoice-pdf-filename";

describe("formatFilenameDate", () => {
  it("formats YYYY-MM-DD as DDMMYYYY", () => {
    expect(formatFilenameDate("2026-08-31")).toBe("31082026");
    expect(formatFilenameDate("2026-09-06")).toBe("06092026");
  });
});

describe("resolveServiceWeekEnd", () => {
  it("returns inclusive Sunday when period_end is exclusive Monday", () => {
    expect(resolveServiceWeekEnd("2026-09-07")).toBe("2026-09-06");
  });

  it("returns the same date when period_end is already inclusive Sunday", () => {
    expect(resolveServiceWeekEnd("2026-09-06")).toBe("2026-09-06");
  });
});

describe("resolveDriverFilenameSlug", () => {
  it("uses first name from trip assignments", () => {
    expect(
      resolveDriverFilenameSlug(undefined, [
        {
          id: "trip-1",
          planned_start: "2026-08-31T16:00:00.000Z",
          notes: null,
          trip_assignments: [{ drivers: { full_name: "Paulin Mokoena" } }],
        },
      ])
    ).toBe("Paulin");
  });

  it("title-cases configured driver labels", () => {
    expect(resolveDriverFilenameSlug("YASEEN", [])).toBe("Yaseen");
  });

  it("joins multi-word labels with underscores", () => {
    expect(resolveDriverFilenameSlug("John Smith", [])).toBe("John_Smith");
  });

  it("returns Various for multiple drivers", () => {
    expect(
      resolveDriverFilenameSlug(undefined, [
        {
          id: "trip-1",
          planned_start: "2026-08-31T16:00:00.000Z",
          notes: null,
          trip_assignments: [{ drivers: { full_name: "Paulin Mokoena" } }],
        },
        {
          id: "trip-2",
          planned_start: "2026-09-01T16:00:00.000Z",
          notes: null,
          trip_assignments: [{ drivers: { full_name: "Yaseen Jacobs" } }],
        },
      ])
    ).toBe("Various");
  });
});

describe("buildInvoicePdfFilename", () => {
  it("builds Paulin week 31 Aug–6 Sep 2026 filename from service week bounds", () => {
    expect(
      buildInvoicePdfFilename({
        period_start: "2026-08-31",
        period_end: "2026-09-07",
        settingsDriverLabel: undefined,
        trips: [
          {
            id: "trip-1",
            planned_start: "2026-08-31T16:00:00.000Z",
            notes: null,
            trip_assignments: [{ drivers: { full_name: "Paulin Mokoena" } }],
          },
        ],
      })
    ).toBe("Paulin_INV_31082026_06092026.pdf");
  });

  it("uses inclusive Sunday period_end when stored that way", () => {
    expect(
      buildInvoicePdfFilename({
        period_start: "2026-08-31",
        period_end: "2026-09-06",
        settingsDriverLabel: "PAULIN",
        trips: [],
      })
    ).toBe("Paulin_INV_31082026_06092026.pdf");
  });
});

describe("invoicePdfDocumentTitle", () => {
  it("strips the .pdf extension for document.title", () => {
    expect(
      invoicePdfDocumentTitle("Paulin_INV_31082026_06092026.pdf")
    ).toBe("Paulin_INV_31082026_06092026");
  });
});
