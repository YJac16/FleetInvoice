"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Building2,
  Bus,
  Car,
  CircleUser,
  MapPinned,
  Radar,
  Users,
  UsersRound,
  Warehouse,
} from "lucide-react";

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
} from "@/services/dashboard.service";
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
  const { can, canModule } = useOrg();
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

  const quickLinks = [
    {
      href: rangeHref("/dispatch"),
      label: "Dispatch",
      show: can("dispatch:view") && canModule("gps"),
    },
    {
      href: rangeHref("/trips"),
      label: "Trips",
      show: can("trips:view"),
    },
    {
      href: "/attendance",
      label: "Attendance",
      show: can("attendance:view") && canModule("attendance"),
    },
    {
      href: rangeHref("/invoices"),
      label: "Invoices",
      show: can("invoices:view") && canModule("billing"),
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
        title="Dashboard"
        description="Overview of your organisation operations."
      />

      {quickLinks.length ? (
        <div className="flex flex-wrap gap-2">
          {quickLinks.map((link) => (
            <Button
              key={link.href}
              variant="outline"
              size="sm"
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
        <CardGridSkeleton cards={5} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" />
      ) : ops ? (
        <RangeQueryBody query={opsQuery} refreshing={opsRefreshing}>
          <div>
          <h2 className="mb-3 font-heading text-lg">
            Operations · {formatRangeLabel(range)}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              title="In progress"
              value={ops.today_in_progress}
              icon={Bus}
              href={can("trips:view") ? rangeHref("/trips") : undefined}
            />
            <StatCard
              title="Assigned"
              value={ops.today_assigned}
              href={can("trips:view") ? rangeHref("/trips") : undefined}
            />
            <StatCard
              title="Planned"
              value={ops.today_planned}
              href={can("trips:view") ? rangeHref("/trips") : undefined}
            />
            <StatCard
              title="Completed"
              value={ops.today_completed}
              href={can("trips:view") ? rangeHref("/trips") : undefined}
            />
            <StatCard
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
        <CardGridSkeleton cards={7} />
      ) : (
        <RangeQueryBody query={countsQuery}>
        <div>
          <h2 className="mb-3 font-heading text-lg">Organisation</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Drivers"
              value={counts?.drivers ?? 0}
              icon={CircleUser}
              href={can("drivers:view") ? "/drivers" : undefined}
            />
            <StatCard
              title="Employees"
              value={counts?.employees ?? 0}
              icon={UsersRound}
              href={can("employees:view") ? "/employees" : undefined}
            />
            <StatCard
              title="Vehicles"
              value={counts?.vehicles ?? 0}
              icon={Car}
              href={can("vehicles:view") ? "/vehicles" : undefined}
            />
            <StatCard
              title="Companies"
              value={counts?.companies ?? 0}
              icon={Building2}
              href={can("companies:view") ? "/companies" : undefined}
            />
            <StatCard
              title="Sites"
              value={counts?.sites ?? 0}
              icon={Warehouse}
              href={can("sites:view") ? "/sites" : undefined}
            />
            <StatCard
              title="Pickup points"
              value={counts?.pickup_points ?? 0}
              icon={MapPinned}
              href={can("pickup_points:view") ? "/pickup-points" : undefined}
            />
            <StatCard
              title="Users"
              value={counts?.users ?? 0}
              icon={Users}
              href={can("users:view") ? "/users" : undefined}
            />
          </div>
        </div>
        </RangeQueryBody>
      )}

      {browseGroups.length ? (
        <div className="space-y-6">
          <div>
            <h2 className="font-heading text-lg">Browse modules</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Jump to any area you can access — same destinations as the sidebar.
            </p>
          </div>
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
        </div>
      ) : null}
    </div>
  );
}
