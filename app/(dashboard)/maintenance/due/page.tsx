import { PageHeader } from "@/components/shared/page-header";
import { IntervalEditor } from "@/features/maintenance/components/interval-editor";
import { MaintenanceTabs } from "@/features/maintenance/components/maintenance-tabs";
import { formatZarAmount } from "@/features/invoices/lib/invoice-print-format";
import { getMaintenancePageContext } from "@/features/maintenance/lib/page-context";
import { listDue, listIntervals } from "@/features/maintenance/lib/insights-queries";
import { PORTAL_CLOCK_TIME_ZONE } from "@/lib/time/portal-clock";

export const dynamic = "force-dynamic";

function todayInSast(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PORTAL_CLOCK_TIME_ZONE }).format(new Date());
}

const EST = <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">Estimate</span>;

export default async function MaintenanceDuePage() {
  const ctx = await getMaintenancePageContext("view");
  const today = todayInSast();
  // Managers see due dates and km only; rand amounts are admin-only.
  const [rows, intervals] = await Promise.all([
    listDue(ctx.organisationId, { today, includeCost: ctx.isAdmin }),
    ctx.isAdmin ? listIntervals(ctx.organisationId) : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="What is due next, worked out from the last Final bill. All figures are estimates."
      />
      <MaintenanceTabs showWorthKeeping={ctx.isAdmin} />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing to forecast yet. {ctx.isAdmin ? "Set an interval below, " : "An administrator needs to set an interval, "}
          then a Final bill with a vehicle and category gives a due estimate.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key} className="space-y-2 rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.category_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.vehicle_label}</p>
                </div>
                {r.overdue ? (
                  <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    Overdue
                  </span>
                ) : null}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm tabular-nums sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Due date</dt>
                  <dd>{r.dueDate ?? "—"}{r.dueDate ? EST : null}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Due at</dt>
                  <dd>{r.dueKm != null ? `${r.dueKm.toLocaleString("en-ZA")} km` : "—"}{r.dueKm != null ? EST : null}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Last done</dt>
                  <dd>{r.last_bill_date}</dd>
                </div>
                {ctx.isAdmin ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Cost (last paid)</dt>
                    <dd>{r.cost != null ? formatZarAmount(r.cost) : "—"}{r.cost != null ? EST : null}</dd>
                  </div>
                ) : null}
              </dl>
              {!r.hasEstimate ? (
                <p className="text-xs text-muted-foreground">
                  Not enough data: the last bill has no odometer reading and no month interval is set.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {ctx.isAdmin ? (
        <section className="mt-8 space-y-3" aria-labelledby="intervals-heading">
          <h2 id="intervals-heading" className="text-base font-medium">Service intervals</h2>
          <p className="text-xs text-muted-foreground">
            Set how often each category is due, by km, months or both. Dates from km need readings at least 30 days and 1,000 km apart.
          </p>
          <IntervalEditor rows={intervals} />
        </section>
      ) : null}
    </div>
  );
}
