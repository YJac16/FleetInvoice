"use client";

import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useMemo } from "react";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  STAFF_TRANSPORT_COMPANY_LABELS,
  type StaffTransportCompany,
} from "@/lib/constants";
import {
  isDriverOnline,
  listDriverPresence,
  listStaffTripsForAdmin,
} from "@/services/staff-trips.service";
import type { DriverPresence, StaffTrip } from "@/types";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

const STATUS_ORDER = ["in_progress", "assigned", "planned", "completed", "cancelled"] as const;

function groupByStatus(trips: StaffTrip[]) {
  const map = new Map<string, StaffTrip[]>();
  for (const status of STATUS_ORDER) map.set(status, []);
  for (const trip of trips) {
    const list = map.get(trip.status) ?? [];
    list.push(trip);
    map.set(trip.status, list);
  }
  return map;
}

export function StaffTripsMonitorPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("trips:manage");

  const today = dayjs().format("YYYY-MM-DD");
  const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");

  const tripsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.staffTripsAdmin(organisationId, today, tomorrow)
      : ["staff-trips-admin", "none"],
    queryFn: () => listStaffTripsForAdmin(organisationId!, today, tomorrow),
    enabled: Boolean(organisationId),
    refetchInterval: 15_000,
  });

  const presenceQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.driverPresence(organisationId)
      : ["driver-presence", "none"],
    queryFn: () => listDriverPresence(organisationId!),
    enabled: Boolean(organisationId),
    refetchInterval: 30_000,
  });

  const presenceByDriver = useMemo(() => {
    const map = new Map<string, DriverPresence>();
    for (const p of presenceQuery.data ?? []) {
      map.set(p.driver_id, p);
    }
    return map;
  }, [presenceQuery.data]);

  const grouped = groupByStatus(tripsQuery.data ?? []);

  if (!organisationId) {
    return (
      <EmptyState
        title="Select an organisation"
        description="Choose an organisation to monitor staff trips."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Staff transport monitor"
        description="Live status for today’s assigned trips (no GPS in v1)."
      />

      {tripsQuery.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {(["assigned", "in_progress", "completed"] as const).map((status) => {
            const trips = grouped.get(status) ?? [];
            return (
              <section
                key={status}
                className="rounded-xl border bg-card p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold capitalize">
                    {status.replace("_", " ")}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {trips.length}
                  </span>
                </div>
                {trips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-2">
                    {trips.map((trip) => {
                      const driverId =
                        trip.trip_assignments?.find((a) => !a.released_at)
                          ?.driver_id ?? null;
                      const driverName =
                        trip.trip_assignments?.find((a) => !a.released_at)
                          ?.drivers?.full_name ?? "—";
                      const presence = driverId
                        ? presenceByDriver.get(driverId)
                        : undefined;
                      const online = isDriverOnline(presence);

                      return (
                        <li
                          key={trip.id}
                          className="rounded-lg border px-3 py-2 text-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">
                                {trip.staff_company
                                  ? STAFF_TRANSPORT_COMPANY_LABELS[
                                      trip.staff_company as StaffTransportCompany
                                    ]
                                  : "—"}
                              </p>
                              <p className="text-muted-foreground">
                                {formatDateTime(trip.planned_start)}
                              </p>
                              <p className="text-muted-foreground truncate">
                                {trip.area_text}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {trip.pax_count ?? 0} pax
                                {trip.total_km != null
                                  ? ` · ${trip.total_km} km`
                                  : trip.opening_km != null
                                    ? ` · open ${trip.opening_km} km`
                                    : ""}
                              </p>
                            </div>
                            <StatusBadge status={trip.status} />
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span
                              className={cn(
                                "size-2 rounded-full",
                                online ? "bg-emerald-500" : "bg-zinc-400"
                              )}
                              title={online ? "Online" : "Offline"}
                            />
                            <span className="text-muted-foreground">
                              {driverName}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {!canManage ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Read-only view. Dispatchers can assign trips from the Trips page.
        </p>
      ) : null}
    </div>
  );
}
