"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Building2, Bus, Car, CircleUser, Radar } from "lucide-react";

import { useOrg } from "@/components/layout/org-context";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { CardGridSkeleton } from "@/components/shared/card-grid-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { useDateRangeFilter } from "@/hooks/use-date-range-filter";
import { usePreservedRangeHref } from "@/hooks/use-preserved-range-href";
import {
  isRangeQueryRefreshing,
  useShowListSkeleton,
} from "@/hooks/use-list-query-skeleton";
import { RangeQueryBody } from "@/components/shared/range-query-body";
import { primaryRouteQueryMeta } from "@/lib/react-query/primary-route-meta";
import { formatRangeLabel } from "@/lib/date-range/sast-range";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  MAIN_NAV,
  NAV_GROUPS,
  type NavGroupId,
} from "@/lib/navigation";
import {
  getDashboardCounts,
  getDashboardOpsSummary,
  getDashboardSummary,
} from "@/services/dashboard.service";
import { DashboardSummaryCards } from "@/features/dashboard/components/dashboard-summary";
import { queryKeys } from "@/utils/query";

const BROWSE_GROUP_ORDER: NavGroupId[] = [
  "people",
  "fleet",
  "places",
  "planning",
  "ops",
  "finance",
  "system",
];

export function DashboardPage() {
  const { can, canModule, profile } = useOrg();
  const organisationId = useActiveOrgId();
  const { range, setPreset, setCustomRange } = useDateRangeFilter("this_week");
  const rangeHref = usePreservedRangeHref();

  const countsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.dashboard(organisationId)
      : ["dashboard", "none"],
    queryFn: () => getDashboardCounts(organisationId!),
    enabled: Boolean(organisationId) && can("dashboard:view"),
    meta: primaryRouteQueryMeta,
  });

  const opsQuery = useQuery({
    queryKey: organisationId
      ? ["dashboard-ops", organisationId, range.from, range.toExclusive]
      : ["dashboard-ops", "none"],
    queryFn: () =>
      getDashboardOpsSummary(organisationId!, range.from, range.toExclusive),
    enabled:
      Boolean(organisationId) &&
      can("dashboard:view") &&
      (can("trips:view") || can("dispatch:view")),
    placeholderData: keepPreviousData,
    meta: primaryRouteQueryMeta,
  });

  const summaryAccess = {
    invoices: can("invoices:view") && canModule("billing"),
    vehicles: can("vehicles:view"),
    trips: can("trips:view") && can("drivers:view"),
  };
  const summaryQuery = useQuery({
    queryKey: organisationId
      ? ["dashboard-summary", organisationId, summaryAccess]
      : ["dashboard-summary", "none"],
    queryFn: () => getDashboardSummary(organisationId!, summaryAccess),
    enabled:
      Boolean(organisationId) &&
      can("dashboard:view") &&
      (summaryAccess.invoices || summaryAccess.vehicles || summaryAccess.trips),
  });

  const showOpsSkeleton = useShowListSkeleton(opsQuery);
  const opsRefreshing = isRangeQueryRefreshing(opsQuery);
  const showCountsSkeleton = useShowListSkeleton(countsQuery);

  if (!organisationId) {
    return (
      <div>
        <PageHeader
          title="Dashboard"
          description="Overview of your organisation operations."
        />
        <EmptyState
          title="Select an organisation"
          description="Choose an organisation from the switcher to view dashboard counts."
        />
      </div>
    );
  }

  const counts = countsQuery.data;
  const ops = opsQuery.data;

  const firstName = profile.full_name?.trim().split(/\s+/)[0] ?? "";

  const quickLinks = [
    {
      href: rangeHref("/invoices"),
      label: "Invoices",
      show: can("invoices:view") && canModule("billing"),
    },
    {
      href: "/maintenance",
      label: "Maintenance",
      show: can("maintenance:view") && canModule("maintenance"),
    },
    {
      href: "/drivers",
      label: "Drivers",
      show: can("drivers:view"),
    },
    {
      href: rangeHref("/trips"),
      label: "Trips",
      show: can("trips:view"),
    },
    {
      href: rangeHref("/dispatch"),
      label: "Dispatch",
      show: can("dispatch:view") && canModule("gps"),
    },
  ].filter((link) => link.show);

  const browseGroups = NAV_GROUPS.filter((group) =>
    BROWSE_GROUP_ORDER.includes(group.id)
  )
    .map((group) => ({
      ...group,
      items: MAIN_NAV.filter(
        (item) =>
          item.group === group.id &&
          item.href !== "/dashboard" &&
          can(item.permission) &&
          canModule(item.module)
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title={firstName ? `Morning, ${firstName}` : "Dashboard"}
        description="Overview of your organisation operations."
      />

      {summaryQuery.data ? (
        <DashboardSummaryCards summary={summaryQuery.data} />
      ) : null}

      {quickLinks.length ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {quickLinks.map((link) => (
            <Button
              key={link.href}
              variant="outline"
              size="sm"
              className="shrink-0"
              render={<Link href={link.href} />}
            >
              {link.label}
            </Button>
          ))}
        </div>
      ) : null}

      {(can("trips:view") || can("dispatch:view")) && can("dashboard:view") ? (
        <DateRangeFilter
          range={range}
          onPresetChange={setPreset}
          onCustomChange={setCustomRange}
          updating={opsRefreshing}
        />
      ) : null}

      {showOpsSkeleton ? (
        <CardGridSkeleton cards={5} className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-5" />
      ) : ops ? (
        <RangeQueryBody query={opsQuery} refreshing={opsRefreshing}>
          <div>
          <h2 className="mb-3 font-heading text-lg">
            Operations · {formatRangeLabel(range)}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
            <StatCard
              compact
              title="In progress"
              value={ops.today_in_progress}
              icon={Bus}
              href={can("trips:view") ? rangeHref("/trips") : undefined}
            />
            <StatCard
              compact
              title="Assigned"
              value={ops.today_assigned}
              href={can("trips:view") ? rangeHref("/trips") : undefined}
            />
            <StatCard
              compact
              title="Planned"
              value={ops.today_planned}
              href={can("trips:view") ? rangeHref("/trips") : undefined}
            />
            <StatCard
              compact
              title="Completed"
              value={ops.today_completed}
              href={can("trips:view") ? rangeHref("/trips") : undefined}
            />
            <StatCard
              compact
              className="col-span-2 xl:col-span-1"
              title="Unassigned"
              value={ops.unassigned}
              description="Need a driver"
              icon={Radar}
              href={
                can("dispatch:view")
                  ? rangeHref("/dispatch")
                  : can("trips:view")
                    ? rangeHref("/trips")
                    : undefined
              }
            />
          </div>
          </div>
        </RangeQueryBody>
      ) : null}

      {showCountsSkeleton ? (
        <CardGridSkeleton cards={6} />
      ) : (
        <RangeQueryBody query={countsQuery}>
        <div>
          <h2 className="mb-3 font-heading text-lg">Organisation</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              compact
              title="Drivers"
              value={counts?.drivers ?? 0}
              icon={CircleUser}
              href={can("drivers:view") ? "/drivers" : undefined}
            />
            <StatCard
              compact
              title="Vehicles"
              value={counts?.vehicles ?? 0}
              icon={Car}
              href={can("vehicles:view") ? "/vehicles" : undefined}
            />
            <StatCard
              compact
              title="Companies"
              value={counts?.companies ?? 0}
              icon={Building2}
              href={can("companies:view") ? "/companies" : undefined}
            />
          </div>
        </div>
        </RangeQueryBody>
      )}

      {browseGroups.length ? (
        <details className="group space-y-6 md:hidden">
          <summary className="cursor-pointer list-none font-heading text-lg">
            All modules
          </summary>
          {browseGroups.map((group) => (
            <div key={group.id}>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.label}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={rangeHref(item.href)}
                      className="flex items-center gap-3 rounded-xl border border-border/80 bg-card px-3 py-3 text-sm transition-colors hover:bg-muted/40"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </details>
      ) : null}
    </div>
  );
}
