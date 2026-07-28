"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  listMyAttendanceEvents,
  listMyEmployeeTrips,
} from "@/services/attendance.service";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

export function EmployeeSchedulePage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canSelf = can("attendance:self") || can("trips:self");

  const tripsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.employeeTrips(organisationId)
      : ["employee-trips", "none"],
    queryFn: () => listMyEmployeeTrips(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const eventsQuery = useQuery({
    queryKey: organisationId
      ? [...queryKeys.attendanceEvents(organisationId), "self"]
      : ["attendance-events", "self", "none"],
    queryFn: () => listMyAttendanceEvents(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  if (!canSelf) {
    return (
      <div>
        <PageHeader title="My schedule" description="Your upcoming trips." />
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
        <PageHeader title="My schedule" description="Your upcoming trips." />
        <EmptyState
          title="No organisation"
          description="You are not an active member of any organisation yet."
        />
      </div>
    );
  }

  const trips = tripsQuery.data ?? [];
  const recentEvents = (eventsQuery.data ?? []).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My schedule"
        description="Upcoming trips for your company and recent boarding events."
      />

      {tripsQuery.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : trips.length === 0 ? (
        <EmptyState
          title="No upcoming trips"
          description="When trips are planned for your company, they will appear here. Ensure your employee profile is linked."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {trips.map((trip) => (
            <Card key={trip.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {trip.routes?.name ?? "Trip"}
                </CardTitle>
                <CardDescription>
                  {formatDateTime(trip.planned_start)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StatusBadge status={trip.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-3 font-heading text-lg">Recent attendance</h2>
        {eventsQuery.isLoading ? (
          <LoadingSkeleton rows={2} />
        ) : recentEvents.length === 0 ? (
          <EmptyState
            title="No boarding events yet"
            description="When a QR is issued or scanned for you, it will show here."
          />
        ) : (
          <ul className="space-y-2">
            {recentEvents.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span>
                  {event.trips?.routes?.name ?? "Trip"} ·{" "}
                  <StatusBadge status={event.event_type} />
                </span>
                <span className="text-muted-foreground">
                  {formatDateTime(event.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
