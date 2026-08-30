"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { DriverInvoicePrintView } from "@/features/invoices/components/driver-invoice-print-view";
import { Button } from "@/components/ui/button";
import { INVOICE_LINE_TYPE_LABELS } from "@/lib/constants";
import type { Invoice, InvoiceLine, Organisation } from "@/types";
import { formatDate } from "@/utils/format";

function money(currency: string, amount: number | string) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `${currency} ${Number.isFinite(n) ? n.toFixed(2) : amount}`;
}

/** Legacy SaaS-style print for company-period / fuel invoices. */
function LegacyInvoicePrintView({
  organisation,
  invoice,
  lines,
  backHref,
  autoPrint = false,
}: {
  organisation: Pick<Organisation, "name" | "logo_url">;
  invoice: Invoice;
  lines: InvoiceLine[];
  backHref: string;
  autoPrint?: boolean;
}) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [autoPrint]);

  const companyName =
    invoice.companies?.name ?? invoice.company_id.slice(0, 8);

  return (
    <div className="invoice-print-root mx-auto max-w-3xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="outline" render={<Link href={backHref} />}>
          Back to invoices
        </Button>
        <Button
          variant="outline"
          onClick={() => window.print()}
          className="gap-2"
        >
          <Printer className="size-4" />
          Print / Save PDF
        </Button>
      </div>

      <article className="invoice-print-sheet rounded-xl border border-border bg-background p-8 shadow-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
          <div className="space-y-2">
            {organisation.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={organisation.logo_url}
                alt={organisation.name}
                className="mb-2 h-12 w-auto object-contain"
              />
            ) : null}
            <p className="font-heading text-2xl tracking-tight">
              {organisation.name}
            </p>
            <p className="text-sm text-muted-foreground">Tax invoice</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <p className="text-lg capitalize">{invoice.status}</p>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Bill to
            </p>
            <p className="mt-1 text-lg font-medium">{companyName}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Period
            </p>
            <p className="mt-1">
              {formatDate(invoice.period_start)} →{" "}
              {formatDate(invoice.period_end)}
            </p>
          </div>
        </section>

        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-2 font-medium">Type</th>
              <th className="py-2 pr-2 font-medium">Description</th>
              <th className="py-2 pr-2 text-right font-medium">Qty</th>
              <th className="py-2 pr-2 text-right font-medium">Unit</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-border/60">
                <td className="py-2.5 pr-2 align-top">
                  {INVOICE_LINE_TYPE_LABELS[line.line_type] ?? line.line_type}
                </td>
                <td className="py-2.5 pr-2 align-top">{line.description}</td>
                <td className="py-2.5 pr-2 text-right align-top tabular-nums">
                  {line.quantity}
                </td>
                <td className="py-2.5 pr-2 text-right align-top tabular-nums">
                  {money(invoice.currency, line.unit_price)}
                </td>
                <td className="py-2.5 text-right align-top tabular-nums">
                  {money(invoice.currency, line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-8 flex flex-col items-end gap-1">
          <p className="font-heading text-xl">
            Total{" "}
            <span className="ml-4 tabular-nums">
              {money(invoice.currency, invoice.total)}
            </span>
          </p>
        </footer>
      </article>
    </div>
  );
}

export function InvoicePrintView({
  organisation,
  invoice,
  lines,
  tripLines,
  backHref,
  autoPrint = false,
}: {
  organisation: Organisation;
  invoice: Invoice;
  lines: InvoiceLine[];
  tripLines?: import("@/types").InvoicePrintTripLine[];
  backHref: string;
  autoPrint?: boolean;
}) {
  if (invoice.driver_id && tripLines) {
    return (
      <DriverInvoicePrintView
        organisation={organisation}
        invoice={invoice}
        tripLines={tripLines}
        backHref={backHref}
        autoPrint={autoPrint}
      />
    );
  }

  return (
    <LegacyInvoicePrintView
      organisation={organisation}
      invoice={invoice}
      lines={lines}
      backHref={backHref}
      autoPrint={autoPrint}
    />
  );
}
