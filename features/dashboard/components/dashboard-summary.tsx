import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardSummary } from "@/features/dashboard/lib/summary";
import { formatZarAmount } from "@/features/invoices/lib/invoice-print-format";

const MAX_DRIVERS = 5;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Plain-text morning summary: real numbers only, no charts. */
export function DashboardSummaryCards({ summary }: { summary: DashboardSummary }) {
  const { invoices, vehiclesDue, driverTrips } = summary;
  const items: Array<{ key: string; title: string; href?: string; lines: string[] }> = [];

  if (invoices && invoices.count > 0) {
    items.push({
      key: "invoices",
      title: "Unpaid invoices",
      href: "/invoices",
      lines: [`${plural(invoices.count, "invoice")} issued`, formatZarAmount(invoices.total)],
    });
  }
  if (vehiclesDue) {
    const lines: string[] = [];
    if (vehiclesDue.overdue) lines.push(`${vehiclesDue.overdue} overdue`);
    if (vehiclesDue.dueSoon) lines.push(`${vehiclesDue.dueSoon} due in 30 days`);
    items.push({
      key: "vehicles",
      title: "Vehicle papers",
      href: "/compliance",
      lines,
    });
  }
  if (driverTrips && driverTrips.length > 0) {
    items.push({
      key: "drivers",
      title: "Drivers' trips this week",
      href: "/trips",
      lines: driverTrips
        .slice(0, MAX_DRIVERS)
        .map((d) => `${d.name} · ${plural(d.trips, "trip")}`),
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="dashboard-summary">
      {items.map((item) => {
        const card = (
          <Card className="h-full rounded-2xl border-border/80 shadow-none">
            <CardContent className="space-y-1 p-4">
              <p className="text-sm font-medium text-muted-foreground">{item.title}</p>
              {item.lines.map((line, i) => (
                <p
                  key={line}
                  className={i === 0 ? "text-lg font-semibold tabular-nums" : "text-sm tabular-nums"}
                >
                  {line}
                </p>
              ))}
            </CardContent>
          </Card>
        );
        return item.href ? (
          <Link key={item.key} href={item.href} className="block">
            {card}
          </Link>
        ) : (
          <div key={item.key}>{card}</div>
        );
      })}
    </div>
  );
}
