"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Button } from "@/components/ui/button";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  driverSubmissionStatus,
  listMyDriverSubmissions,
} from "@/services/driver-submitted-trips.service";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

const STATUS_LABEL = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
} as const;

const STATUS_CLASS = {
  pending: "bg-amber-500/20 text-amber-200",
  approved: "bg-emerald-500/20 text-emerald-200",
  rejected: "bg-red-500/20 text-red-200",
} as const;

export function DriverSubmissionsPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canSelf = can("trips:self");

  const query = useQuery({
    queryKey: organisationId
      ? queryKeys.driverSubmissions(organisationId)
      : ["driver-submissions", "none"],
    queryFn: () => listMyDriverSubmissions(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  if (!canSelf) {
    return (
      <EmptyState title="No access" description="You cannot view submissions." />
    );
  }

  if (query.isLoading) {
    return <LoadingSkeleton rows={4} />;
  }

  const trips = query.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">My submissions</h1>
          <p className="mt-1 text-sm text-zinc-400">Driver-logged trips awaiting review.</p>
        </div>
        <Button size="sm" render={<Link href="/driver/log">Log trip</Link>} />
      </div>

      {trips.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          description="Log a trip when you need admin approval."
          action={
            <Button render={<Link href="/driver/log">Log a trip</Link>} />
          }
        />
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => {
            const status = driverSubmissionStatus(trip);
            return (
              <li
                key={trip.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-white">
                    {trip.companies?.name ?? "Company"}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase",
                      STATUS_CLASS[status]
                    )}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <p className="mt-1 text-zinc-400">{formatDateTime(trip.planned_start)}</p>
                <p className="mt-2 text-zinc-300">{trip.area_text}</p>
                {trip.rejected_reason ? (
                  <p className="mt-2 text-xs text-red-300">{trip.rejected_reason}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
