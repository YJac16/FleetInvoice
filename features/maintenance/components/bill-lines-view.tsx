import { formatZarAmount } from "@/features/invoices/lib/invoice-print-format";
import type { BillLine } from "@/features/maintenance/types";

function qty(n: number): string {
  return String(Number(n.toFixed(3)));
}

/** Saved lines with excl / VAT / incl per line. Cards on phones, a table from sm up. */
export function BillLinesView({ lines }: { lines: BillLine[] }) {
  if (lines.length === 0) {
    return <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No lines on this bill.</p>;
  }
  return (
    <>
      <ul className="space-y-3 sm:hidden">
        {lines.map((line) => (
          <li key={line.id} className="space-y-2 rounded-2xl border bg-card px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium break-words">{line.description}</p>
              <p className="text-xs text-muted-foreground">
                {qty(line.quantity)} × {formatZarAmount(line.unit_amount)}
                {line.category_name ? ` · ${line.category_name}` : ""}
                {line.vat_applicable ? "" : " · No VAT"}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm tabular-nums">
              <div>
                <dt className="text-xs text-muted-foreground">Excl.</dt>
                <dd>{formatZarAmount(line.line_excl)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">VAT</dt>
                <dd>{formatZarAmount(line.line_vat)}</dd>
              </div>
              <div className="text-right">
                <dt className="text-xs text-muted-foreground">Incl.</dt>
                <dd className="font-medium">{formatZarAmount(line.line_incl)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border bg-card sm:block">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 text-right font-medium">Qty</th>
              <th className="px-4 py-2 text-right font-medium">Unit</th>
              <th className="px-4 py-2 text-right font-medium">Excl.</th>
              <th className="px-4 py-2 text-right font-medium">VAT</th>
              <th className="px-4 py-2 text-right font-medium">Incl.</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {lines.map((line) => (
              <tr key={line.id} className="border-b last:border-0">
                <td className="px-4 py-2">
                  <span className="break-words">{line.description}</span>
                  {line.category_name || !line.vat_applicable ? (
                    <span className="block text-xs text-muted-foreground">
                      {[line.category_name, line.vat_applicable ? null : "No VAT"].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-right">{qty(line.quantity)}</td>
                <td className="px-4 py-2 text-right">{formatZarAmount(line.unit_amount)}</td>
                <td className="px-4 py-2 text-right">{formatZarAmount(line.line_excl)}</td>
                <td className="px-4 py-2 text-right">{formatZarAmount(line.line_vat)}</td>
                <td className="px-4 py-2 text-right font-medium">{formatZarAmount(line.line_incl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function BillTotals({
  excl,
  vat,
  incl,
  vatLabel,
}: {
  excl: number;
  vat: number;
  incl: number;
  vatLabel: string;
}) {
  return (
    <dl className="space-y-1 rounded-2xl border bg-card px-4 py-3 text-sm tabular-nums">
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Subtotal excl. VAT</dt>
        <dd>{formatZarAmount(excl)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">{vatLabel}</dt>
        <dd>{formatZarAmount(vat)}</dd>
      </div>
      <div className="flex justify-between gap-4 border-t pt-2 text-base font-medium">
        <dt>Total incl. VAT</dt>
        <dd>{formatZarAmount(incl)}</dd>
      </div>
    </dl>
  );
}
