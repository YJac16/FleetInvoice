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
import { tripCompanyLabel } from "@/features/trips/lib/trip-display";

type StaffTripCardProps = {
  trip: StaffTrip;
  compact?: boolean;
  showRate?: boolean;
  /** Hide status badge when a timeline is shown elsewhere */
  hideStatus?: boolean;
  onClick?: () => void;
  className?: string;
};

export function StaffTripCard({
  trip,
  compact,
  showRate,
  hideStatus,
  onClick,
  className,
}: StaffTripCardProps) {
  const isNow = isSameDayInTz(trip.planned_start, nowInDriverTz().toDate());
  const companyLabel = tripCompanyLabel(trip)?.trim() ?? "";
  const company =
    companyLabel && companyLabel !== "—" && companyLabel !== "-" ? companyLabel : null;
  const areaText = trip.area_text?.trim() || trip.service_locations?.trim() || "";
  const area = areaText === "—" || areaText === "-" ? "" : areaText;
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card text-left",
        compact ? "px-3 py-2.5" : "px-4 py-3",
        onClick && "transition hover:border-foreground/30",
        className
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {formatTripTime(trip.planned_start)}
            </span>
            {isNow ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Today
              </span>
            ) : (
              <span className="min-w-0 truncate">{formatDayLabel(trip.planned_start)}</span>
            )}
          </div>
          {company ? (
            <p className={cn("mt-1 break-words font-semibold text-foreground", compact ? "text-base" : "text-lg")}>
              {company}
            </p>
          ) : null}
          {area ? (
            <p className="mt-1 flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{area}</span>
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
              <span className="text-foreground">Total {trip.total_km} km</span>
            ) : null}
            {showRate ? (
              <span>R{STAFF_TRANSPORT_FLAT_RATE_ZAR}</span>
            ) : null}
          </div>
        </div>
        {!hideStatus ? <StatusBadge status={trip.status} /> : null}
      </div>
    </Wrapper>
  );
}
