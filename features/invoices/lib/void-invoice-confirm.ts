import { formatDate } from "@/utils/format";
import type { Invoice } from "@/types";

/** Names the invoice (bill-to, driver, period) so the confirm is unambiguous. */
export function voidInvoiceLabel(inv: Invoice): string {
  const billTo = inv.companies?.name ?? inv.company_id.slice(0, 8);
  const driver = inv.drivers?.full_name ? `, ${inv.drivers.full_name}` : "";
  return `${billTo}${driver} (${formatDate(inv.period_start)} → ${formatDate(inv.period_end)})`;
}

export function voidInvoiceAmount(inv: Invoice): string {
  return `${inv.currency} ${inv.total}`;
}

export function voidInvoiceDescription(inv: Invoice): string {
  return `Void the invoice for ${voidInvoiceLabel(inv)} for ${voidInvoiceAmount(inv)}? This cannot be undone.`;
}
