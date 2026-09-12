"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, MapPinOff } from "lucide-react";

import { useOrg } from "@/components/layout/org-context";
import {
  nowInDriverTz,
  todayDateString,
} from "@/features/driver-portal/lib/dates";
import { activeStaffTripForGps } from "@/features/driver-portal/lib/gps";
import { useStaffTripGps } from "@/features/driver-portal/hooks/use-staff-trip-gps";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { listMyStaffTrips } from "@/services/staff-trips.service";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

function tomorrowDateString(): string {
  return nowInDriverTz().add(1, "day").format("YYYY-MM-DD");
}

/** Background GPS ping while an en-route staff trip is active and the portal is focused. */
export function StaffTripGpsTracker() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canSelf = can("trips:self");
  const canPublish = can("gps:publish");
  const today = todayDateString();
  const tomorrow = tomorrowDateString();

  const tripsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.staffTrips(organisationId, today, tomorrow)
      : ["staff-trips", "none"],
    queryFn: () => listMyStaffTrips(organisationId!, today, tomorrow),
    enabled: Boolean(organisationId) && canSelf && canPublish,
    refetchInterval: 15_000,
  });

  const active = activeStaffTripForGps(tripsQuery.data ?? []);

  const gpsState = useStaffTripGps({
    organisationId,
    tripId: active?.id ?? null,
    tripStatus: active?.status ?? null,
    enabled: canSelf && canPublish,
  });

  if (gpsState.status === "idle") return null;

  const isError =
    gpsState.status === "denied" || gpsState.status === "unavailable";

  return (
    <div
      className={cn(
        "mb-3 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px]",
        isError
          ? "border-amber-800/60 bg-amber-950/40 text-amber-100"
          : "border-emerald-900/50 bg-emerald-950/30 text-emerald-100"
      )}
      role="status"
    >
      {isError ? (
        <MapPinOff className="size-3 shrink-0" aria-hidden />
      ) : (
        <MapPin className="size-3 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        {gpsState.status === "sharing" ? (
          <p>
            <span className="font-medium">GPS live</span>
            <span className="text-emerald-200/70"> · keep tab open</span>
          </p>
        ) : (
          <p>
            <span className="font-medium">Location required</span>
            <span className="opacity-80"> · {gpsState.message}</span>
          </p>
        )}
      </div>
      {gpsState.status === "sharing" ? (
        <span
          className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
