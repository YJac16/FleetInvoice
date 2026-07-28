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
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBar } from "@/components/shared/search-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { AssignTripDialog } from "@/features/trips/components/assign-trip-dialog";
import { GenerateTripsDialog } from "@/features/trips/components/generate-trips-dialog";
import { TripPassengersDialog } from "@/features/trips/components/trip-passengers-dialog";
import { canTransition } from "@/features/trips/lib/transitions";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useDebounce } from "@/hooks/use-debounce";
import { cancelTrip, listTrips } from "@/services/trips.service";
import type { Trip } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

export function TripsPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("trips:manage");
  const canViewAttendance = can("attendance:view") || can("trips:view");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [cancelling, setCancelling] = useState<Trip | null>(null);
  const [assigningTripId, setAssigningTripId] = useState<string | null>(null);
  const [passengersTrip, setPassengersTrip] = useState<Trip | null>(null);

  const tripsQuery = useQuery({
    queryKey: organisationId ? queryKeys.trips(organisationId) : ["trips", "none"],
    queryFn: () => listTrips(organisationId!),
    enabled: Boolean(organisationId),
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
      [trip.routes?.name, trip.notes]
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
        cell: ({ row }) => row.original.routes?.name ?? "—",
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
          const canCancel = canManage && canTransition(status, "cancelled");
          return (
            <div className="flex justify-end gap-1">
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
            <Button onClick={() => setGenerateOpen(true)}>
              <Plus className="size-4" />
              Generate trips
            </Button>
          ) : null
        }
      />

      <div className="mb-4">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {tripsQuery.isLoading ? (
        <LoadingSkeleton />
      ) : rows.length === 0 && !debouncedSearch ? (
        <EmptyState
          icon={Bus}
          title="No trips yet"
          description="Generate trips from a schedule to see them here."
          actionLabel={canManage ? "Generate trips" : undefined}
          onAction={canManage ? () => setGenerateOpen(true) : undefined}
        />
      ) : (
        <DataTable columns={columns} data={rows} />
      )}

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
