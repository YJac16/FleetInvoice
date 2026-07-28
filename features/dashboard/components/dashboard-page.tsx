"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Car,
  CircleUser,
  MapPinned,
  Users,
  UsersRound,
  Warehouse,
} from "lucide-react";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { getDashboardCounts } from "@/services/dashboard.service";
import { queryKeys } from "@/utils/query";

export function DashboardPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();

  const countsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.dashboard(organisationId)
      : ["dashboard", "none"],
    queryFn: () => getDashboardCounts(organisationId!),
    enabled: Boolean(organisationId) && can("dashboard:view"),
  });

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

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your organisation operations."
      />

      {countsQuery.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Drivers" value={counts?.drivers ?? 0} icon={CircleUser} />
          <StatCard
            title="Employees"
            value={counts?.employees ?? 0}
            icon={UsersRound}
          />
          <StatCard title="Vehicles" value={counts?.vehicles ?? 0} icon={Car} />
          <StatCard
            title="Companies"
            value={counts?.companies ?? 0}
            icon={Building2}
          />
          <StatCard title="Sites" value={counts?.sites ?? 0} icon={Warehouse} />
          <StatCard
            title="Pickup points"
            value={counts?.pickup_points ?? 0}
            icon={MapPinned}
          />
          <StatCard title="Users" value={counts?.users ?? 0} icon={Users} />
        </div>
      )}
    </div>
  );
}
