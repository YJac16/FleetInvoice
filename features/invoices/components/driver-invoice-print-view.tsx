"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";

import {
  buildTripInvoiceTableRows,
  driverFirstNameUpper,
  formatAmountRand,
  formatDateSlash,
} from "@/features/invoices/lib/print-format";
import {
  resolveInvoiceBanking,
  resolveInvoiceBillTo,
  resolveInvoiceFooter,
  resolveInvoiceIssuer,
} from "@/features/invoices/lib/issuer-profile";
import {
  invoiceDateFromWeekStart,
  serviceWeekSunday,
} from "@/features/invoices/lib/week";
import { Button } from "@/components/ui/button";
import type { Invoice, InvoicePrintTripLine, Organisation } from "@/types";

export function DriverInvoicePrintView({
  organisation,
  invoice,
  tripLines,
  backHref,
  autoPrint = false,
}: {
  organisation: Organisation;
  invoice: Invoice;
  tripLines: InvoicePrintTripLine[];
  backHref: string;
  autoPrint?: boolean;
}) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [autoPrint]);

  const issuer = resolveInvoiceIssuer(organisation);
  const banking = resolveInvoiceBanking(organisation);
  const footer = resolveInvoiceFooter(organisation);
  const billTo = resolveInvoiceBillTo(invoice.companies);

  const invoiceDate = formatDateSlash(invoiceDateFromWeekStart(invoice.period_start));
  const serviceFrom = formatDateSlash(invoice.period_start);
  const serviceTo = formatDateSlash(serviceWeekSunday(invoice.period_start));
  const serviceRange = `${serviceFrom} - ${serviceTo}`;

  const driverLabel = driverFirstNameUpper(invoice.drivers?.full_name);
  const regNo = useMemo(() => {
    for (const line of tripLines) {
      const reg = line.registration_number?.trim();
      if (reg) return reg;
    }
    return "";
  }, [tripLines]);

  const tableRows = useMemo(
    () =>
      buildTripInvoiceTableRows(
        tripLines.map((line) => ({
          plannedStart: line.planned_start,
          company: line.company_name,
          pax: line.pax_count,
          area: line.area_name,
          amount: line.amount,
        }))
      ),
    [tripLines]
  );

  const total = formatAmountRand(Number(invoice.total));

  return (
    <div className="driver-invoice-print mx-auto max-w-[820px] bg-white px-4 py-6 text-black print:max-w-none print:bg-white print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
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

      <article className="driver-invoice-sheet border border-black bg-white text-[13px] leading-snug text-black print:text-[12px]">
        {/* Header grid */}
        <div className="grid grid-cols-[1fr_240px] border-b border-black">
          <div className="border-r border-black p-3">
            <p className="text-lg font-bold text-[#1a7f37]">{issuer.name}</p>
            {issuer.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p className="mt-1">{issuer.phone}</p>
          </div>
          <div className="grid grid-rows-[auto_auto_auto]">
            <div className="grid grid-cols-[72px_1fr] border-b border-black">
              <div className="border-r border-black p-2 font-semibold">Date:</div>
              <div className="p-2 text-center">{invoiceDate}</div>
            </div>
            <div className="grid grid-cols-[88px_1fr_16px_1fr] border-b border-black">
              <div className="border-r border-black p-2 font-semibold">
                Service from
              </div>
              <div className="p-2 text-center">{serviceFrom}</div>
              <div className="border-x border-black p-2 text-center">-</div>
              <div className="p-2 text-center">{serviceTo}</div>
            </div>
            <div className="p-2" />
          </div>
        </div>

        {/* Bill to */}
        <div className="border-b border-black p-3">
          <p className="font-bold text-[#1a7f37]">INVOICE TO</p>
          {billTo.name ? <p>{billTo.name}</p> : null}
          {billTo.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {billTo.phone ? <p>{billTo.phone}</p> : null}
        </div>

        {/* Reg + driver */}
        <div className="grid grid-cols-2 border-b border-black text-center font-semibold">
          <div className="border-r border-black p-2">
            REG NO: {regNo || "\u00a0"}
          </div>
          <div className="p-2">DRIVER: {driverLabel || "\u00a0"}</div>
        </div>
        <div className="border-b border-black p-2 text-center font-medium">
          {serviceRange}
        </div>

        {/* Trips table */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-center text-[12px] font-bold">
              <th className="border-r border-black p-2">NO.</th>
              <th className="border-r border-black p-2">DATE</th>
              <th className="border-r border-black p-2">TIME</th>
              <th className="border-r border-black p-2">COMPANY</th>
              <th className="border-r border-black p-2">PAX</th>
              <th className="border-r border-black p-2">Area</th>
              <th className="p-2">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center">
                  No trip lines
                </td>
              </tr>
            ) : (
              tableRows.map((row) => (
                <tr key={row.no} className="border-b border-black text-center">
                  <td className="border-r border-black p-1.5">{row.no}</td>
                  <td className="border-r border-black p-1.5">
                    {row.showDate ? row.date : "\u00a0"}
                  </td>
                  <td className="border-r border-black p-1.5">{row.time}</td>
                  <td className="border-r border-black p-1.5 text-left">
                    {row.company}
                  </td>
                  <td className="border-r border-black p-1.5">{row.pax}</td>
                  <td className="border-r border-black p-1.5 text-left">
                    {row.area}
                  </td>
                  <td className="p-1.5">{row.amount}</td>
                </tr>
              ))
            )}
            <tr className="font-bold">
              <td
                colSpan={6}
                className="border-r border-black p-2 text-right"
              >
                Total:
              </td>
              <td className="p-2 text-center">{total}</td>
            </tr>
          </tbody>
        </table>

        {/* Banking */}
        <div className="border-t border-black p-3">
          <p className="font-bold">BANKING DETAILS</p>
          <div className="mt-2 grid grid-cols-[130px_1fr] gap-y-1">
            <span>Bank:</span>
            <span>{banking.bank}</span>
            <span>Account Name:</span>
            <span>{banking.accountName}</span>
            <span>Account Number:</span>
            <span>{banking.accountNumber}</span>
            <span>Branch Code:</span>
            <span>{banking.branchCode}</span>
            <span>Account Type:</span>
            <span>{banking.accountType}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-black p-3">
          <p>{footer.name}</p>
          <p>{footer.phone}</p>
          <p>
            <a href={`mailto:${footer.email}`} className="text-blue-700 underline">
              {footer.email}
            </a>
          </p>
          <p className="mt-3 font-bold">Thank You</p>
        </div>
      </article>
    </div>
  );
}
