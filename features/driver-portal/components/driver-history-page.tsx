"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useOrg } from "@/components/layout/org-context";
import { DateRangeEmptyActions } from "@/components/shared/date-range-empty-actions";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { RangeListErrorState } from "@/components/shared/range-list-error-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { useDateRangeFilter } from "@/hooks/use-date-range-filter";
import {
  isRangeQueryRefreshing,
  useShowListSkeleton,
} from "@/hooks/use-list-query-skeleton";
import { RangeQueryBody } from "@/components/shared/range-query-body";
import { primaryRouteQueryMeta } from "@/lib/react-query/primary-route-meta";
import { resolveRangeFilterResultCount } from "@/lib/date-range/filter-result-count";
import { formatRangeLabel } from "@/lib/date-range/sast-range";
import { StaffTripCard } from "@/features/driver-portal/components/staff-trip-card";
import { completedTrips } from "@/features/driver-portal/lib/trip-labels";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { listMyStaffTrips } from "@/services/staff-trips.service";
import { queryKeys } from "@/utils/query";

export function DriverHistoryPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canSelf = can("trips:self");

  const { range, setPreset, setCustomRange } = useDateRangeFilter("this_week");
  const from = range.from;
  const toExclusive = range.toExclusive;

  const tripsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.staffTrips(organisationId, from, toExclusive)
      : ["staff-trips", "none"],
    queryFn: () => listMyStaffTrips(organisationId!, from, toExclusive),
    enabled: Boolean(organisationId) && canSelf,
    placeholderData: keepPreviousData,
    meta: primaryRouteQueryMeta,
  });

  const showHistorySkeleton = useShowListSkeleton(tripsQuery);
  const rangeRefreshing = isRangeQueryRefreshing(tripsQuery);

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
          Completed trips · {formatRangeLabel(range)}
        </p>
      </div>

      <DateRangeFilter
        range={range}
        onPresetChange={setPreset}
        onCustomChange={setCustomRange}
        updating={rangeRefreshing}
        resultCount={resolveRangeFilterResultCount(tripsQuery, {
          listReady: !showHistorySkeleton,
          count: history.length,
        })}
        resultUnit={{ singular: "trip", plural: "trips" }}
        className="[&_button]:border-zinc-700 [&_button]:bg-zinc-900/50"
      />

      {tripsQuery.isError ? (
        <RangeListErrorState
          title="Couldn't load trips"
          error={tripsQuery.error}
          onRetry={() => void tripsQuery.refetch()}
        />
      ) : showHistorySkeleton ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <RangeQueryBody query={tripsQuery} refreshing={rangeRefreshing}>
          {history.length === 0 ? (
            <EmptyState
              title="No trips in this range"
              description="Try a different date range or complete a trip to see it here."
              action={
                <DateRangeEmptyActions
                  range={range}
                  onPresetChange={setPreset}
                />
              }
            />
          ) : (
            <div className="space-y-2">
              {history.map((trip) => (
                <StaffTripCard key={trip.id} trip={trip} compact />
              ))}
            </div>
          )}
        </RangeQueryBody>
      )}
    </div>
  );
}
