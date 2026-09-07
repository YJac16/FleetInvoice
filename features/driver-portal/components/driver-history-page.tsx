"use client";

import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { StaffTripCard } from "@/features/driver-portal/components/staff-trip-card";
import { mondayOfWeek } from "@/features/driver-portal/lib/dates";
import { completedTrips } from "@/features/driver-portal/lib/trip-labels";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { listMyStaffTrips } from "@/services/staff-trips.service";
import { queryKeys } from "@/utils/query";

export function DriverHistoryPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canSelf = can("trips:self");

  const from = dayjs().subtract(30, "day").format("YYYY-MM-DD");
  const to = dayjs().add(1, "day").format("YYYY-MM-DD");

  const tripsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.staffTrips(organisationId, from, to)
      : ["staff-trips", "none"],
    queryFn: () => listMyStaffTrips(organisationId!, from, to),
    enabled: Boolean(organisationId) && canSelf,
  });

  const history = completedTrips(tripsQuery.data ?? []).reverse();

  if (!canSelf || !organisationId) {
    return (
      <EmptyState
        title="Driver access required"
        description="Sign in as a linked driver to view history."
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-white">
          History
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Completed trips (last 30 days)
        </p>
      </div>

      {tripsQuery.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : history.length === 0 ? (
        <EmptyState
          title="No completed trips"
          description="Finished trips will appear here."
        />
      ) : (
        <div className="space-y-2">
          {history.map((trip) => (
            <StaffTripCard key={trip.id} trip={trip} compact />
          ))}
        </div>
      )}
    </div>
  );
}
