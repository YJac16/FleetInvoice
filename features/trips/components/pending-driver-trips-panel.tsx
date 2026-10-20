"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminManualTripDialog } from "@/features/trips/components/admin-manual-trip-dialog";
import { EditWaybillDialog } from "@/features/trips/components/edit-waybill-dialog";
import {
  approveDriverTrip,
  listPendingDriverSubmissions,
  rejectDriverTrip,
} from "@/services/driver-submitted-trips.service";
import type { StaffTrip } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

export function PendingDriverTripsPanel({
  organisationId,
  canManage,
}: {
  organisationId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<StaffTrip | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editTrip, setEditTrip] = useState<StaffTrip | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: [...queryKeys.pendingDriverSubmissions(organisationId), "list"],
    queryFn: () => listPendingDriverSubmissions(organisationId),
    enabled: canManage,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.pendingDriverSubmissions(organisationId),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips(organisationId) });
  };

  const approveMutation = useMutation({
    mutationFn: (tripId: string) => approveDriverTrip(tripId),
    onSuccess: () => {
      toast.success("Trip approved");
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await approveDriverTrip(id);
      }
    },
    onSuccess: () => {
      toast.success("Selected trips approved");
      setSelected(new Set());
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectDriverTrip(rejectTarget!.id, rejectReason),
    onSuccess: () => {
      toast.success("Trip rejected");
      setRejectTarget(null);
      setRejectReason("");
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (!canManage) {
    return (
      <EmptyState
        title="No access"
        description="You need trip management permission to review driver submissions."
      />
    );
  }

  if (query.isLoading) {
    return <LoadingSkeleton rows={5} />;
  }

  const trips = query.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setManualOpen(true)}>
          Create trip manually
        </Button>
        {trips.length > 0 ? (
          <Button
            size="sm"
            disabled={selected.size === 0 || bulkApproveMutation.isPending}
            onClick={() => bulkApproveMutation.mutate([...selected])}
          >
            Approve selected ({selected.size})
          </Button>
        ) : null}
      </div>

      {trips.length === 0 ? (
        <EmptyState
          title="No pending driver trips"
          description="Submissions from the driver log form appear here."
        />
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => {
            const checked = selected.has(trip.id);
            return (
              <li
                key={trip.id}
                className="rounded-lg border border-border bg-card p-4 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(trip.id);
                        else next.delete(trip.id);
                        setSelected(next);
                      }}
                    />
                    <div>
                      <p className="font-medium">
                        {trip.companies?.name ?? "Company"} · {trip.pax_count ?? 0} pax
                      </p>
                      <p className="text-muted-foreground">
                        {formatDateTime(trip.planned_start)}
                      </p>
                      <p className="mt-1">{trip.area_text}</p>
                      {trip.total_km != null ? (
                        <p className="text-muted-foreground">{trip.total_km} km</p>
                      ) : null}
                    </div>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditTrip(trip)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(trip.id)}
                      disabled={approveMutation.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setRejectTarget(trip)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <EditWaybillDialog
        open={Boolean(editTrip)}
        onOpenChange={(open) => !open && setEditTrip(null)}
        organisationId={organisationId}
        trip={editTrip}
        onSaved={invalidate}
        variant="pending"
      />

      <AdminManualTripDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        organisationId={organisationId}
        onCreated={invalidate}
      />

      <AlertDialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => !open && setRejectTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject driver trip</AlertDialogTitle>
            <AlertDialogDescription>
              The driver will see this reason on their submissions list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Input
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rejectMutation.mutate()}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
