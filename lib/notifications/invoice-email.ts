import { formatInvoicePeriod, formatZarAmount, resolveInvoicePrintDate } from "@/features/invoices/lib/invoice-print-format";
import type { Company, Invoice } from "@/types";

export function buildInvoiceEmailContent(input: {
  invoice: Invoice;
  company: Company | null;
  supplierName: string;
  printUrl: string;
}): { subject: string; text: string; html: string } {
  const companyName =
    input.company?.name ?? input.invoice.companies?.name ?? "your company";
  const invoiceDate = resolveInvoicePrintDate({
    issued_at: input.invoice.issued_at,
    period_end: input.invoice.period_end,
  });
  const servicePeriod = formatInvoicePeriod(
    input.invoice.period_start,
    input.invoice.period_end
  );
  const total = formatZarAmount(input.invoice.total);

  const subject = `Invoice — ${companyName} — ${servicePeriod}`;

  const text = [
    `Hello,`,
    ``,
    `Please find your invoice from ${input.supplierName}.`,
    ``,
    `Company: ${companyName}`,
    `Invoice date: ${invoiceDate}`,
    `Service period: ${servicePeriod}`,
    `Total: ${total}`,
    ``,
    `View and print the invoice:`,
    input.printUrl,
    ``,
    `Thank you.`,
  ].join("\n");

  const html = `
    <p>Hello,</p>
    <p>Please find your invoice from <strong>${escapeHtml(input.supplierName)}</strong>.</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#666">Company</td><td>${escapeHtml(companyName)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Invoice date</td><td>${escapeHtml(invoiceDate)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Service period</td><td>${escapeHtml(servicePeriod)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Total</td><td><strong>${escapeHtml(total)}</strong></td></tr>
    </table>
    <p><a href="${escapeHtml(input.printUrl)}">View and print invoice</a></p>
    <p>Thank you.</p>
  `.trim();

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
