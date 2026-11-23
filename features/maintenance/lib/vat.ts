import type { VatMode } from "@/features/maintenance/types";

/**
 * Live preview of the server's VAT maths (save_workshop_bill, 00074). The
 * saved figures always come from the database; this only drives the form.
 * Works in cents so 0.005 rounds up like Postgres numeric round().
 */

function toCents(value: number): number {
  // Half-up for the non-negative amounts the form allows. The epsilon
  // absorbs float noise such as 1.005 * 100 = 100.49999...
  return Math.round(value * 100 + 1e-7);
}

export type LineVat = { excl: number; vat: number; incl: number };

export function computeLineVat(input: {
  quantity: number;
  unitAmount: number;
  vatApplicable: boolean;
  mode: VatMode;
  rate: number;
}): LineVat {
  const { quantity, unitAmount, vatApplicable, mode, rate } = input;
  if (!(quantity > 0) || !(unitAmount >= 0) || !(rate >= 0)) {
    return { excl: 0, vat: 0, incl: 0 };
  }
  const amount = toCents(quantity * unitAmount);
  if (!vatApplicable) return { excl: amount / 100, vat: 0, incl: amount / 100 };
  if (mode === "exclusive") {
    const vat = toCents((amount * rate) / 100 / 100);
    return { excl: amount / 100, vat: vat / 100, incl: (amount + vat) / 100 };
  }
  const vat = toCents((amount * rate) / (100 + rate) / 100);
  return { excl: (amount - vat) / 100, vat: vat / 100, incl: amount / 100 };
}

export function sumLineVat(lines: LineVat[]): LineVat {
  const cents = lines.reduce(
    (acc, l) => ({
      excl: acc.excl + toCents(l.excl),
      vat: acc.vat + toCents(l.vat),
      incl: acc.incl + toCents(l.incl),
    }),
    { excl: 0, vat: 0, incl: 0 }
  );
  return { excl: cents.excl / 100, vat: cents.vat / 100, incl: cents.incl / 100 };
}

/** Parse a form string; anything unparseable counts as 0 for the preview. */
export function previewNumber(value: string | undefined): number {
  const n = Number((value ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

export function formatVatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}%`;
}
