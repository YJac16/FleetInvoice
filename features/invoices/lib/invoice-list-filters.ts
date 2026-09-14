import { mondayOfWeek } from "@/features/invoices/lib/week";
import type { Invoice } from "@/types";

export type InvoiceSortOrder = "newest" | "oldest";
export type InvoiceWeekFilter = "this_week" | "last_4_weeks" | "all";
export type InvoiceStatusFilter = "all" | Invoice["status"];

export type InvoiceListFilters = {
  sortOrder: InvoiceSortOrder;
  weekFilter: InvoiceWeekFilter;
  statusFilter: InvoiceStatusFilter;
};

export const DEFAULT_INVOICE_LIST_FILTERS: InvoiceListFilters = {
  sortOrder: "newest",
  weekFilter: "all",
  statusFilter: "all",
};

function addUtcDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday (UTC) for the service week used by week chips. */
export function currentServiceWeekStart(now = new Date()): string {
  return mondayOfWeek(now);
}

export function matchesInvoiceWeekFilter(
  invoice: Pick<Invoice, "period_start">,
  weekFilter: InvoiceWeekFilter,
  now = new Date()
): boolean {
  if (weekFilter === "all") return true;

  const thisMonday = currentServiceWeekStart(now);
  const periodStart = invoice.period_start;

  if (weekFilter === "this_week") {
    return periodStart === thisMonday;
  }

  const fourWeeksAgoMonday = addUtcDays(thisMonday, -21);
  return periodStart >= fourWeeksAgoMonday && periodStart <= thisMonday;
}

export function matchesInvoiceStatusFilter(
  invoice: Pick<Invoice, "status">,
  statusFilter: InvoiceStatusFilter
): boolean {
  if (statusFilter === "all") return true;
  return invoice.status === statusFilter;
}

export function compareInvoicesByPeriodEnd(
  a: Pick<Invoice, "period_end">,
  b: Pick<Invoice, "period_end">,
  sortOrder: InvoiceSortOrder
): number {
  const cmp = b.period_end.localeCompare(a.period_end);
  return sortOrder === "newest" ? cmp : -cmp;
}

export function filterAndSortInvoices(
  invoices: Invoice[],
  filters: InvoiceListFilters,
  now = new Date()
): Invoice[] {
  return invoices
    .filter(
      (invoice) =>
        matchesInvoiceWeekFilter(invoice, filters.weekFilter, now) &&
        matchesInvoiceStatusFilter(invoice, filters.statusFilter)
    )
    .sort((a, b) => compareInvoicesByPeriodEnd(a, b, filters.sortOrder));
}
