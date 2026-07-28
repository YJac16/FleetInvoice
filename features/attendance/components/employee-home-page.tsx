"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { listMyAttendanceEvents } from "@/services/attendance.service";
import { listMyTripPassengers } from "@/services/trip-passengers.service";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

export function EmployeeHomePage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canSelf = can("attendance:self") || can("trips:self");

  const seatsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.myTripPassengers(organisationId)
      : ["my-trip-passengers", "none"],
    queryFn: () => listMyTripPassengers(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const eventsQuery = useQuery({
    queryKey: organisationId
      ? [...queryKeys.attendanceEvents(organisationId), "self"]
      : ["attendance-events", "self", "none"],
    queryFn: () => listMyAttendanceEvents(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const todaySeats = useMemo(() => {
    const seats = seatsQuery.data ?? [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return seats.filter((seat) => {
      if (!["confirmed", "requested", "boarded"].includes(seat.status)) {
        return false;
      }
      const planned = seat.trips?.planned_start
        ? new Date(seat.trips.planned_start).getTime()
        : 0;
      return planned >= start.getTime() && planned <= end.getTime();
    });
  }, [seatsQuery.data]);

  const nextSeat = todaySeats[0] ?? (seatsQuery.data ?? []).find((s) =>
    ["confirmed", "requested"].includes(s.status)
  );

  if (!canSelf) {
    return (
      <div>
        <PageHeader title="Today" description="Your transport for today." />
        <EmptyState
          title="Employee access required"
          description="Ask an admin to link your profile to an employee record."
        />
      </div>
    );
  }

  if (!organisationId) {
    return (
      <div>
        <PageHeader title="Today" description="Your transport for today." />
        <EmptyState
          title="No organisation"
          description="You are not an active member of any organisation yet."
        />
      </div>
    );
  }

  const recentEvents = (eventsQuery.data ?? []).slice(0, 5);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Today"
        description="Your booked seats and boarding status."
      />

      {seatsQuery.isLoading ? (
        <LoadingSkeleton rows={2} />
      ) : !nextSeat ? (
        <EmptyState
          title="No seats booked"
          description="Book a seat on a scheduled trip for to-work or end-of-shift transport."
          action={
            <Button render={<Link href="/employee/book" />}>Book a seat</Button>
          }
        />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                {nextSeat.trips?.routes?.name ?? "Trip"}
              </CardTitle>
              <StatusBadge status={nextSeat.status} />
            </div>
            <CardDescription>
              {nextSeat.trips?.planned_start
                ? formatDateTime(nextSeat.trips.planned_start)
                : "—"}
              {" · "}
              {nextSeat.direction === "to_work" ? "To work" : "From work"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button render={<Link href="/employee/board" />}>
              Show boarding QR
            </Button>
            <Button variant="outline" render={<Link href="/employee/book" />}>
              Book another
            </Button>
          </CardContent>
        </Card>
      )}

      {todaySeats.length > 1 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Other seats today</h2>
          {todaySeats.slice(1).map((seat) => (
            <Card key={seat.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {seat.trips?.routes?.name ?? "Trip"}
                </CardTitle>
                <CardDescription>
                  {seat.trips?.planned_start
                    ? formatDateTime(seat.trips.planned_start)
                    : "—"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StatusBadge status={seat.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {recentEvents.length ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Recent boarding</h2>
          <ul className="space-y-2 text-sm">
            {recentEvents.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <span>
                  {event.event_type} ·{" "}
                  {event.trips?.routes?.name ?? "Trip"}
                </span>
                <span className="text-muted-foreground">
                  {formatDateTime(event.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
