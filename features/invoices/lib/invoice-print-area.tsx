import type { ReactNode } from "react";

/** Shuttle / stop refs in AREA — keep SS-… tokens on one line in print. */
const AREA_REF_TOKEN = /(SS-[\w-]+)/g;

export function splitInvoicePrintArea(area: string): string[] {
  if (!area) return [];
  return area.split(AREA_REF_TOKEN).filter((part) => part.length > 0);
}

export function isInvoicePrintAreaRefToken(part: string): boolean {
  return /^SS-[\w-]+$/.test(part);
}

export function renderInvoicePrintArea(area: string): ReactNode {
  const parts = splitInvoicePrintArea(area);
  if (parts.length === 0) return area;
  return parts.map((part, index) =>
    isInvoicePrintAreaRefToken(part) ? (
      <span key={`${part}-${index}`} className="invoice-print-area-ref whitespace-nowrap">
        {part}
      </span>
    ) : (
      <span key={`text-${index}`}>{part}</span>
    )
  );
}
