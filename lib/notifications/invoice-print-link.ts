export type InvoicePrintPortal = "ops" | "company";

export function invoicePrintPath(
  invoiceId: string,
  portal: InvoicePrintPortal
): string {
  if (portal === "company") {
    return `/company/invoices/${invoiceId}/print`;
  }
  return `/invoices/${invoiceId}/print`;
}

/** Absolute print URL on the configured app origin. Ignores caller-supplied links. */
export function buildInvoicePrintUrl(
  appUrl: string,
  invoiceId: string,
  portal: InvoicePrintPortal
): string {
  const base = new URL(appUrl);
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new Error("App URL must be http or https");
  }
  const url = new URL(invoicePrintPath(invoiceId, portal), base);
  if (url.origin !== base.origin) {
    throw new Error("Invoice print URL must stay on the app origin");
  }
  return url.toString();
}
