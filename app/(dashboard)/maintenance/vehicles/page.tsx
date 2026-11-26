import { PageHeader } from "@/components/shared/page-header";
import { formatZarAmount } from "@/features/invoices/lib/invoice-print-format";
import { MaintenanceTabs } from "@/features/maintenance/components/maintenance-tabs";
import { WorthKeepingFilters } from "@/features/maintenance/components/worth-keeping-filters";
import { listWorthKeeping } from "@/features/maintenance/lib/insights-queries";
import { getMaintenanceAdminContext } from "@/features/maintenance/lib/page-context";
import { parseOwner, parsePeriod, VERDICT_LABEL, type Verdict } from "@/features/maintenance/lib/worth-keeping";
import { cn } from "@/lib/utils";
import { PORTAL_CLOCK_TIME_ZONE } from "@/lib/time/portal-clock";

export const dynamic = "force-dynamic";

const VERDICT_CLASS: Record<Verdict, string> = {
  keep: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  review: "bg-destructive/10 text-destructive",
  no_activity: "bg-muted text-muted-foreground",
};

function todayInSast(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PORTAL_CLOCK_TIME_ZONE }).format(new Date());
}

export default async function WorthKeepingPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string; owner?: string }>;
}) {
  // Platform owner / organisation_admin only; everyone else gets a 404.
  const ctx = await getMaintenanceAdminContext();
  const sp = await searchParams;
  const months = parsePeriod(sp.months);
  const owner = parseOwner(sp.owner);
  const rows = await listWorthKeeping(ctx.admin, ctx.organisationId, { today: todayInSast(), months, owner });

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="Which vehicles earn more than they cost. Fixed costs are not included."
      />
      <MaintenanceTabs showWorthKeeping />
      <WorthKeepingFilters months={months} owner={owner} />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No vehicles for this owner.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.vehicle_id} className="space-y-2 rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium">{r.vehicle_label}</p>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", VERDICT_CLASS[r.verdict])}>
                  {VERDICT_LABEL[r.verdict]}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm tabular-nums sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Invoiced revenue</dt>
                  <dd>{formatZarAmount(r.revenue)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Final bills (incl. VAT)</dt>
                  <dd>{formatZarAmount(r.bills)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Fuel (priced)</dt>
                  <dd>{formatZarAmount(r.fuel)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Contribution</dt>
                  <dd className={cn("font-medium", r.contribution < 0 && "text-destructive")}>
                    {formatZarAmount(r.contribution)}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
