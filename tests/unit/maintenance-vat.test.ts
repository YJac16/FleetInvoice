/**
 * U5: the bill form's live VAT preview must match save_workshop_bill (00074).
 * Expected figures are the ones tests/db/maintenance-rpc.test.mjs checks
 * against the real RPC.
 */
import { describe, expect, it } from "vitest";

import { computeLineVat, formatVatRate, previewNumber, sumLineVat } from "@/features/maintenance/lib/vat";

const fmt = (l: { excl: number; vat: number; incl: number }) =>
  `${l.excl.toFixed(2)}/${l.vat.toFixed(2)}/${l.incl.toFixed(2)}`;

describe("computeLineVat (mirrors the RPC)", () => {
  it("exclusive at 15%, rounded half-up per line (V1)", () => {
    expect(fmt(computeLineVat({ quantity: 1, unitAmount: 100.1, vatApplicable: true, mode: "exclusive", rate: 15 }))).toBe("100.10/15.02/115.12");
    expect(fmt(computeLineVat({ quantity: 3, unitAmount: 33.33, vatApplicable: true, mode: "exclusive", rate: 15 }))).toBe("99.99/15.00/114.99");
    expect(fmt(computeLineVat({ quantity: 1, unitAmount: 50, vatApplicable: false, mode: "exclusive", rate: 15 }))).toBe("50.00/0.00/50.00");
  });

  it("rounds per line, not per bill (V2)", () => {
    const line = computeLineVat({ quantity: 1, unitAmount: 0.1, vatApplicable: true, mode: "exclusive", rate: 15 });
    expect(fmt(sumLineVat([line, line, line]))).toBe("0.30/0.06/0.36");
  });

  it("is half-up, not banker's rounding (V3)", () => {
    expect(fmt(computeLineVat({ quantity: 1, unitAmount: 0.05, vatApplicable: true, mode: "exclusive", rate: 10 }))).toBe("0.05/0.01/0.06");
  });

  it("backs VAT out of inclusive amounts", () => {
    expect(fmt(computeLineVat({ quantity: 1, unitAmount: 230, vatApplicable: true, mode: "inclusive", rate: 15 }))).toBe("200.00/30.00/230.00");
    expect(fmt(computeLineVat({ quantity: 1, unitAmount: 10, vatApplicable: true, mode: "inclusive", rate: 15 }))).toBe("8.70/1.30/10.00");
    expect(fmt(computeLineVat({ quantity: 1, unitAmount: 20, vatApplicable: false, mode: "inclusive", rate: 15 }))).toBe("20.00/0.00/20.00");
  });

  it("charges no VAT at a 0% rate in either mode", () => {
    expect(fmt(computeLineVat({ quantity: 2, unitAmount: 50, vatApplicable: true, mode: "exclusive", rate: 0 }))).toBe("100.00/0.00/100.00");
    expect(fmt(computeLineVat({ quantity: 2, unitAmount: 50, vatApplicable: true, mode: "inclusive", rate: 0 }))).toBe("100.00/0.00/100.00");
  });

  it("handles fractional quantities and custom rates", () => {
    // 2.5 x 19.99 = 49.975 -> 49.98; 7.5% -> 3.7485 -> 3.75
    expect(fmt(computeLineVat({ quantity: 2.5, unitAmount: 19.99, vatApplicable: true, mode: "exclusive", rate: 7.5 }))).toBe("49.98/3.75/53.73");
  });

  it("previews zero for incomplete input instead of NaN", () => {
    expect(fmt(computeLineVat({ quantity: 0, unitAmount: 10, vatApplicable: true, mode: "exclusive", rate: 15 }))).toBe("0.00/0.00/0.00");
    expect(previewNumber("")).toBe(0);
    expect(previewNumber("abc")).toBe(0);
    expect(previewNumber(" 12.5 ")).toBe(12.5);
  });

  it("formats rates without trailing zeros", () => {
    expect(formatVatRate(15)).toBe("15%");
    expect(formatVatRate(7.5)).toBe("7.5%");
    expect(formatVatRate(0)).toBe("0%");
  });
});
