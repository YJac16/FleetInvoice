import { isInstantInRange, type ResolvedDateRange } from "@/lib/date-range/sast-range";
import type { Invoice } from "@/types";

export function filterTripsByPlannedStart<T extends { planned_start: string }>(
  items: T[],
  range: ResolvedDateRange
): T[] {
  return items.filter((item) => isInstantInRange(item.planned_start, range));
}

export function filterInvoicesByPeriodStart(
  invoices: Invoice[],
  range: ResolvedDateRange
): Invoice[] {
  return invoices.filter((invoice) => {
    const day = invoice.period_start;
    return day >= range.from && day <= range.to;
  });
}
