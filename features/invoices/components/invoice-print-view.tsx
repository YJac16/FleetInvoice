"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";

import { Button } from "@/components/ui/button";
import type { InvoicePrintSettings } from "@/features/invoices/lib/invoice-print-settings";
import {
  formatInvoiceDate,
  formatInvoicePeriod,
  formatZarAmount,
} from "@/features/invoices/lib/invoice-print-format";
import { buildInvoicePrintRows } from "@/features/invoices/lib/invoice-print-rows";
import { resolveDriverLabel } from "@/features/invoices/lib/invoice-trip-row";
import type { InvoiceLineWithTrip } from "@/services/invoices.service";
import type { Company, Invoice, Organisation } from "@/types";

export function InvoicePrintView({
  organisation,
  company,
  invoice,
  lines,
  printSettings,
  backHref,
  autoPrint = false,
}: {
  organisation: Pick<Organisation, "name" | "logo_url" | "settings">;
  company: Company | null;
  invoice: Invoice;
  lines: InvoiceLineWithTrip[];
  printSettings: InvoicePrintSettings;
  backHref: string;
  autoPrint?: boolean;
}) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [autoPrint]);

  const tripEmbeds = useMemo(
    () =>
      lines
        .map((line) => line.trips)
        .filter((trip): trip is NonNullable<typeof trip> => Boolean(trip)),
    [lines]
  );

  const rows = useMemo(() => buildInvoicePrintRows(lines), [lines]);

  const supplier = printSettings.supplier ?? { name: organisation.name };
  const banking = printSettings.banking;
  const driverLabel = resolveDriverLabel(printSettings.driver_label, tripEmbeds);
  const invoiceDate = formatInvoiceDate(invoice.issued_at ?? invoice.created_at);
  const servicePeriod = formatInvoicePeriod(
    invoice.period_start,
    invoice.period_end
  );
  const companyName = company?.name ?? invoice.companies?.name ?? "—";
  const companyAddress = company?.address?.trim();
  const companyPhone = company?.contact_phone?.trim();
  const regNo = company?.code?.trim();

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

      <article className="invoice-print-sheet rounded-xl border border-border bg-background p-8 font-sans text-sm text-foreground shadow-none print:border-0 print:p-0">
        <header className="grid gap-6 border-b border-black/20 pb-4 sm:grid-cols-2">
          <div className="space-y-0.5 leading-snug">
            {organisation.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={organisation.logo_url}
                alt={organisation.name}
                className="mb-2 h-10 w-auto object-contain"
              />
            ) : null}
            <p className="text-base font-semibold">{supplier.name}</p>
            {supplier.address_lines?.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {supplier.phone ? <p>{supplier.phone}</p> : null}
          </div>
          <div className="space-y-1 sm:text-right">
            <p>
              <span className="font-medium">Date:</span> {invoiceDate}
            </p>
            <p>
              <span className="font-medium">Service from</span> {servicePeriod}
            </p>
          </div>
        </header>

        <section className="mt-5 space-y-1 leading-snug">
          <p className="text-xs font-semibold tracking-wide">INVOICE TO</p>
          <p className="text-base font-semibold">{companyName}</p>
          {companyAddress ? (
            companyAddress.split(/\n+/).map((line) => <p key={line}>{line}</p>)
          ) : null}
          {companyPhone ? <p>{companyPhone}</p> : null}
          <p className="pt-1 text-xs uppercase tracking-wide">
            {regNo ? <>REG NO: {regNo} </> : null}
            {driverLabel !== "—" ? <>DRIVER: {driverLabel}</> : null}
          </p>
          <p>{servicePeriod}</p>
        </section>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/30 text-left text-xs uppercase">
              <th className="w-10 py-2 pr-2 font-semibold">N0.</th>
              <th className="py-2 pr-2 font-semibold">DATE</th>
              <th className="py-2 pr-2 font-semibold">TIME</th>
              <th className="py-2 pr-2 font-semibold">COMPANY</th>
              <th className="w-12 py-2 pr-2 font-semibold">PAX</th>
              <th className="py-2 pr-2 font-semibold">Area</th>
              <th className="py-2 text-right font-semibold">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-muted-foreground">
                  No line items
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.lineNumber} className="border-b border-black/10 align-top">
                  <td className="py-2 pr-2 tabular-nums">{row.lineNumber}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{row.date}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{row.time}</td>
                  <td className="py-2 pr-2">{row.company}</td>
                  <td className="py-2 pr-2 tabular-nums">{row.pax}</td>
                  <td className="py-2 pr-2">{row.area}</td>
                  <td className="py-2 text-right tabular-nums whitespace-nowrap">
                    {row.amount}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <footer className="mt-4 space-y-6">
          <div className="flex justify-end border-t border-black/20 pt-3">
            <p className="text-base font-semibold">
              Total:{" "}
              <span className="ml-6 tabular-nums">
                {formatZarAmount(invoice.total)}
              </span>
            </p>
          </div>

          {banking &&
          (banking.bank ||
            banking.account_name ||
            banking.account_number ||
            banking.branch_code ||
            banking.account_type) ? (
            <div className="space-y-1 leading-snug">
              <p className="text-xs font-semibold tracking-wide">
                BANKING DETAILS
              </p>
              {banking.bank ? <p>Bank: {banking.bank}</p> : null}
              {banking.account_name ? (
                <p>Account Name: {banking.account_name}</p>
              ) : null}
              {banking.account_number ? (
                <p>Account Number: {banking.account_number}</p>
              ) : null}
              {banking.branch_code ? (
                <p>Branch Code: {banking.branch_code}</p>
              ) : null}
              {banking.account_type ? (
                <p>Account Type: {banking.account_type}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-0.5 leading-snug">
            {supplier.name ? <p className="font-medium">{supplier.name}</p> : null}
            {supplier.phone ? <p>{supplier.phone}</p> : null}
            {supplier.email ? <p>{supplier.email}</p> : null}
            <p className="pt-2">Thank You</p>
          </div>

          {invoice.notes ? (
            <p className="text-xs text-muted-foreground">{invoice.notes}</p>
          ) : null}
        </footer>
      </article>
    </div>
  );
}
