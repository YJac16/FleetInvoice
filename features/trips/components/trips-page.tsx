"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Bus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { RangeListErrorState } from "@/components/shared/range-list-error-state";
import { DateRangeEmptyActions } from "@/components/shared/date-range-empty-actions";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBar } from "@/components/shared/search-bar";
import { useDateRangeFilter } from "@/hooks/use-date-range-filter";
import { usePreservedRangeHref } from "@/hooks/use-preserved-range-href";
import {
  isRangeQueryRefreshing,
  useShowListSkeleton,
} from "@/hooks/use-list-query-skeleton";
import { RangeQueryBody } from "@/components/shared/range-query-body";
import { useTripsListQuery } from "@/hooks/use-trips-list-query";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { AssignStaffTripDialog } from "@/features/trips/components/assign-staff-trip-dialog";
import { AssignTripDialog } from "@/features/trips/components/assign-trip-dialog";
import { GenerateTripsDialog } from "@/features/trips/components/generate-trips-dialog";
import { TripLocationsDialog } from "@/features/trips/components/trip-locations-dialog";
import { TripPassengersDialog } from "@/features/trips/components/trip-passengers-dialog";
import {
  tripAreaLabel,
  tripRouteLabel,
} from "@/features/trips/lib/trip-display";
import { canTransition } from "@/features/trips/lib/transitions";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useDebounce } from "@/hooks/use-debounce";
import { resolveRangeFilterResultCount } from "@/lib/date-range/filter-result-count";
import { resolveTripsListEmptyState } from "@/features/trips/lib/trips-empty-state";
import { cancelTrip, orgHasAnyTrips } from "@/services/trips.service";
import type { Trip } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";
import Link from "next/link";

export function TripsPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("trips:manage");
  const canViewAttendance = can("attendance:view") || can("trips:view");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [assignStaffOpen, setAssignStaffOpen] = useState(false);
  const [cancelling, setCancelling] = useState<Trip | null>(null);
  const [assigningTripId, setAssigningTripId] = useState<string | null>(null);
  const [passengersTrip, setPassengersTrip] = useState<Trip | null>(null);
  const [locationsTrip, setLocationsTrip] = useState<Trip | null>(null);
  const { range, setPreset, setCustomRange } = useDateRangeFilter("this_week");
  const rangeHref = usePreservedRangeHref();

  const tripsQuery = useTripsListQuery(organisationId, range);

  const showTripsSkeleton = useShowListSkeleton(tripsQuery);
  const rangeRefreshing = isRangeQueryRefreshing(tripsQuery);

  const hasSearchFilter = debouncedSearch.trim().length > 0;
  const rangedResultEmpty =
    !showTripsSkeleton && (tripsQuery.data ?? []).length === 0;

  const orgTripsExistQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.tripsOrgHasAny(organisationId)
      : ["trips-org-has-any", "none"],
    queryFn: () => orgHasAnyTrips(organisationId!),
    enabled:
      Boolean(organisationId) &&
      rangedResultEmpty &&
      !hasSearchFilter &&
      !tripsQuery.isError,
    staleTime: 60_000,
  });

  const orgTripCountStatus = orgTripsExistQuery.isError
    ? "error"
    : orgTripsExistQuery.isPending || orgTripsExistQuery.isFetching
      ? "loading"
      : orgTripsExistQuery.isSuccess
        ? "ready"
        : "loading";

  const emptyState = resolveTripsListEmptyState({
    hasSearchFilter,
    orgTripCountStatus,
    orgHasAnyTrips: orgTripsExistQuery.data,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelTrip(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.trips(organisationId!),
      });
      toast.success("Trip cancelled");
      setCancelling(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const rows = useMemo(() => {
    const data = tripsQuery.data ?? [];
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return data;
    return data.filter((trip) =>
      [
        trip.routes?.name,
        trip.notes,
        trip.area_text,
        trip.service_locations,
        trip.companies?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [tripsQuery.data, debouncedSearch]);

  const columns = useMemo<ColumnDef<Trip, unknown>[]>(
    () => [
      {
        accessorKey: "routes",
        header: "Route",
        cell: ({ row }) => tripRouteLabel(row.original),
      },
      {
        accessorKey: "planned_start",
        header: "Planned start",
        cell: ({ row }) => formatDateTime(row.original.planned_start),
      },
      {
        accessorKey: "planned_end",
        header: "Planned end",
        cell: ({ row }) => formatDateTime(row.original.planned_end),
      },
      {
        id: "locations",
        header: "AREA",
        cell: ({ row }) => tripAreaLabel(row.original),
      },
      {
        id: "driver",
        header: "Driver",
        cell: ({ row }) => {
          const active = row.original.trip_assignments?.find(
            (assignment) => !assignment.released_at
          );
          return active?.drivers?.full_name ?? "—";
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const status = row.original.status;
          const canAssign = canManage && (status === "planned" || status === "assigned");
          const canEditLocations = canManage && status !== "cancelled";
          const canCancel = canManage && canTransition(status, "cancelled");
          return (
            <div className="flex justify-end gap-1">
              {canEditLocations ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocationsTrip(row.original)}
                >
                  Locations
                </Button>
              ) : null}
              {canViewAttendance ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPassengersTrip(row.original)}
                >
                  Passengers
                </Button>
              ) : null}
              {canAssign ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAssigningTripId(row.original.id)}
                >
                  Assign
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCancelling(row.original)}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canManage, canViewAttendance]
  );

  if (!organisationId) {
    return (
      <div>
        <PageHeader
          title="Trips"
          description="Planned trips generated from route schedules."
        />
        <EmptyState
          title="Select an organisation"
          description="Choose an organisation from the switcher to view trips."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Trips"
        description="Planned trips generated from route schedules."
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                render={<Link href={rangeHref("/staff-transport")} />}
              >
                Monitor
              </Button>
              <Button variant="secondary" onClick={() => setAssignStaffOpen(true)}>
                Create waybill
              </Button>
              <Button onClick={() => setGenerateOpen(true)}>
                <Plus className="size-4" />
                Generate trips
              </Button>
            </div>
          ) : null
        }
      />

      <DateRangeFilter
        range={range}
        onPresetChange={setPreset}
        onCustomChange={setCustomRange}
        updating={rangeRefreshing}
        resultCount={resolveRangeFilterResultCount(tripsQuery, {
          listReady: !showTripsSkeleton,
          count: hasSearchFilter
            ? rows.length
            : (tripsQuery.data ?? []).length,
        })}
        resultUnit={{ singular: "trip", plural: "trips" }}
      />
      <div className="mb-4">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {showTripsSkeleton ? (
        <LoadingSkeleton />
      ) : tripsQuery.isError ? (
        <RangeListErrorState
          icon={Bus}
          title="Couldn't load trips"
          error={tripsQuery.error}
          onRetry={() => void tripsQuery.refetch()}
        />
      ) : (
        <RangeQueryBody query={tripsQuery} refreshing={rangeRefreshing}>
          {rows.length === 0 ? (
              <EmptyState
                icon={Bus}
                title={emptyState.title}
                description={emptyState.description}
                action={
                  <div className="flex flex-col items-center gap-3">
                    {canManage && emptyState.showGenerateAction ? (
                      <Button onClick={() => setGenerateOpen(true)}>
                        Generate trips
                      </Button>
                    ) : null}
                    <DateRangeEmptyActions
                      range={range}
                      onPresetChange={setPreset}
                      hasExtraFilter={hasSearchFilter}
                      onClearExtraFilter={() => setSearch("")}
                      extraFilterClearLabel="Clear search"
                    />
                  </div>
                }
              />
          ) : (
            <DataTable columns={columns} data={rows} />
          )}
        </RangeQueryBody>
      )}

      <AssignStaffTripDialog
        open={assignStaffOpen}
        onOpenChange={setAssignStaffOpen}
        organisationId={organisationId}
        onAssigned={() => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.trips(organisationId),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.staffTripsAdmin(
              organisationId,
              new Date().toISOString().slice(0, 10),
              new Date(Date.now() + 86400000).toISOString().slice(0, 10)
            ),
          });
        }}
      />

      <GenerateTripsDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        organisationId={organisationId}
        onGenerated={() =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.trips(organisationId),
          })
        }
      />

      <AssignTripDialog
        open={Boolean(assigningTripId)}
        onOpenChange={(open) => !open && setAssigningTripId(null)}
        organisationId={organisationId}
        tripId={assigningTripId}
        onAssigned={() =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.trips(organisationId),
          })
        }
      />

      <TripPassengersDialog
        open={Boolean(passengersTrip)}
        onOpenChange={(open) => !open && setPassengersTrip(null)}
        organisationId={organisationId}
        tripId={passengersTrip?.id ?? null}
        tripLabel={passengersTrip?.routes?.name}
      />

      <TripLocationsDialog
        open={Boolean(locationsTrip)}
        onOpenChange={(open) => !open && setLocationsTrip(null)}
        organisationId={organisationId}
        tripId={locationsTrip?.id ?? null}
        tripLabel={locationsTrip?.routes?.name}
        initialValue={
          locationsTrip?.service_locations ?? locationsTrip?.routes?.name ?? ""
        }
        onSaved={() =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.trips(organisationId),
          })
        }
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel trip?"
        description="This marks the trip as cancelled. It will remain visible in the trip list."
        confirmLabel="Cancel trip"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelling && cancelMutation.mutate(cancelling.id)}
      />
    </div>
  );
}
