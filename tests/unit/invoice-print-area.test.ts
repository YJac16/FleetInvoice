import { describe, expect, it } from "vitest";

import {
  isInvoicePrintAreaRefToken,
  splitInvoicePrintArea,
} from "@/features/invoices/lib/invoice-print-area";

describe("invoice print area refs", () => {
  it("splits SS- tokens for nowrap wrapping", () => {
    expect(splitInvoicePrintArea("Central / SS-STOP-12")).toEqual([
      "Central / ",
      "SS-STOP-12",
    ]);
    expect(isInvoicePrintAreaRefToken("SS-STOP-12")).toBe(true);
    expect(isInvoicePrintAreaRefToken("Central")).toBe(false);
  });
});
