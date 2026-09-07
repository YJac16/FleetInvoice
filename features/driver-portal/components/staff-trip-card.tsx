"use client";

import { MapPin, Users } from "lucide-react";

import { StatusBadge } from "@/components/shared/status-badge";
import { STAFF_TRANSPORT_FLAT_RATE_ZAR } from "@/lib/constants";
import type { StaffTrip } from "@/types";
import { cn } from "@/lib/utils";
import {
  formatDayLabel,
  formatTripTime,
  isSameDayInTz,
  nowInDriverTz,
} from "@/features/driver-portal/lib/dates";
import { staffCompanyLabel } from "@/features/driver-portal/lib/trip-labels";

type StaffTripCardProps = {
  trip: StaffTrip;
  compact?: boolean;
  showRate?: boolean;
  onClick?: () => void;
  className?: string;
};

export function StaffTripCard({
  trip,
  compact,
  showRate,
  onClick,
  className,
}: StaffTripCardProps) {
  const isNow = isSameDayInTz(trip.planned_start, nowInDriverTz().toDate());
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border border-zinc-800 bg-zinc-900/80 text-left",
        compact ? "px-3 py-2.5" : "px-4 py-3",
        onClick && "transition hover:border-zinc-600",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="font-medium text-zinc-300">
              {formatTripTime(trip.planned_start)}
            </span>
            {isNow ? (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                Today
              </span>
            ) : (
              <span>{formatDayLabel(trip.planned_start)}</span>
            )}
          </div>
          <p className={cn("mt-1 font-semibold text-white", compact ? "text-base" : "text-lg")}>
            {staffCompanyLabel(trip.staff_company)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
            <MapPin className="size-3.5 shrink-0 text-emerald-500" />
            <span className="truncate">{trip.area_text ?? "—"}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" />
              {trip.pax_count ?? 0} pax
            </span>
            {trip.opening_km != null ? (
              <span>Open {trip.opening_km} km</span>
            ) : null}
            {trip.closing_km != null ? (
              <span>Close {trip.closing_km} km</span>
            ) : null}
            {trip.total_km != null ? (
              <span className="text-zinc-300">Total {trip.total_km} km</span>
            ) : null}
            {showRate ? (
              <span>R{STAFF_TRANSPORT_FLAT_RATE_ZAR}</span>
            ) : null}
          </div>
        </div>
        <StatusBadge status={trip.status} />
      </div>
    </Wrapper>
  );
}
