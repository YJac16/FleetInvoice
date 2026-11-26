import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BillStatusBadge } from "@/features/maintenance/components/bill-status-badge";
import type {
  InvoiceStatusKey,
  InvoiceStatusTotals,
  MaintenanceMonth,
} from "@/features/dashboard/lib/summary";
import { formatZarAmount } from "@/features/invoices/lib/invoice-print-format";

const BAR =
  "h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-500 motion-reduce:transition-none";

const STATUS_ROWS: Array<{ key: InvoiceStatusKey; label: string; variant: "secondary" | "default" | "destructive" }> = [
  { key: "draft", label: "Draft", variant: "secondary" },
  { key: "issued", label: "Issued", variant: "default" },
  { key: "void", label: "Void", variant: "destructive" },
];

function pct(value: number, max: number) {
  return max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
}

/** Invoice totals by status as plain CSS bars. Money: render only with invoices access. */
export function InvoiceTotalsChart({ totals }: { totals: InvoiceStatusTotals }) {
  const rows = STATUS_ROWS.filter((r) => totals[r.key].count > 0);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => totals[r.key].total));
  return (
    <Card className="rounded-2xl border-border/80 shadow-none" data-testid="invoice-totals-chart">
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-medium text-muted-foreground">Invoice totals by status</p>
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <Badge variant={r.variant}>{r.label}</Badge>
                <span className="tabular-nums">
                  {formatZarAmount(totals[r.key].total)}
                  <span className="text-muted-foreground"> · {totals[r.key].count}</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className={BAR} style={{ width: `${pct(totals[r.key].total, max)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

/** Final workshop bills per month as CSS columns. Admin-only data. */
export function MaintenanceCostsChart({ months }: { months: MaintenanceMonth[] }) {
  const total = months.reduce((s, m) => s + m.total, 0);
  if (total <= 0) return null;
  const max = Math.max(...months.map((m) => m.total));
  return (
    <Card className="rounded-2xl border-border/80 shadow-none" data-testid="maintenance-costs-chart">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">Workshop costs, last 6 months</p>
          <BillStatusBadge status="approved" />
        </div>
        <p className="text-lg font-semibold tabular-nums">{formatZarAmount(total)}</p>
        <ul className="flex h-24 items-end gap-2" aria-label="Final workshop bills per month">
          {months.map((m) => (
            <li
              key={m.month}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              title={`${m.month}: ${formatZarAmount(m.total)}`}
            >
              <div
                className="w-full rounded-t bg-primary motion-safe:transition-[height] motion-safe:duration-500 motion-reduce:transition-none"
                style={{ height: `${pct(m.total, max)}%` }}
              />
              <span className="text-[10px] text-muted-foreground">{monthLabel(m.month)}</span>
              <span className="sr-only">{formatZarAmount(m.total)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
