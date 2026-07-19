import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminTripDetailClient } from "@/features/pricing/components/admin-trip-detail-client";
import { TripForm } from "@/features/trips/components/trip-form";
import { TripStatusBadge } from "@/features/trips/components/trip-status-badge";
import { ROUTES } from "@/lib/constants";
import { hasSupabaseConfig } from "@/lib/env";
import { canDriverEditTrip } from "@/lib/trips/constants";
import { formatTripTime } from "@/lib/trips/filters";
import {
  getAdminTrip,
  listTripPricingHistory,
} from "@/services/admin-trips.service";
import { getTripLookupOptions } from "@/services/lookups.service";
import {
  getDemoAdminSessionContext,
  getDemoSessionContext,
  getSessionContext,
} from "@/services/profile.service";
import { getMyTrip } from "@/services/trips.service";

export const metadata: Metadata = {
  title: "Trip details",
};

interface TripDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TripDetailPage({ params }: TripDetailPageProps) {
  const { id } = await params;

  const session =
    (await getSessionContext()) ??
    (!hasSupabaseConfig()
      ? process.env.NEXT_PUBLIC_DEMO_ROLE === "admin"
        ? getDemoAdminSessionContext()
        : getDemoSessionContext()
      : null);

  if (session?.role === "admin") {
    const [trip, history] = await Promise.all([
      getAdminTrip(id),
      listTripPricingHistory(id),
    ]);
    if (!trip) notFound();
    return <AdminTripDetailClient trip={trip} history={history} />;
  }

  const [trip, lookups] = await Promise.all([
    getMyTrip(id),
    getTripLookupOptions(),
  ]);

  if (!trip) notFound();

  const editable = canDriverEditTrip(trip.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={editable ? "Edit Trip" : "View Trip"}
        description={
          editable
            ? "Update this pending or rejected trip, then resubmit."
            : "Approved and invoiced trips are read-only."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TripStatusBadge status={trip.status} />
            {!editable ? <Badge variant="secondary">Read only</Badge> : null}
            <Button
              variant="outline"
              render={<Link href={ROUTES.trips} />}
              className="min-h-11"
            >
              <ArrowLeft />
              My Trips
            </Button>
          </div>
        }
      />

      <TripForm
        mode="edit"
        tripId={trip.id}
        lookups={lookups}
        readOnly={!editable}
        initialValues={{
          tripDate: trip.trip_date,
          tripTime: formatTripTime(trip.trip_time),
          companyId: trip.company_id,
          vehicleId: trip.vehicle_id,
          pickupArea: trip.pickup_area,
          destinationArea: trip.destination_area,
          areasVisited: trip.areas_visited,
          passengers: trip.passengers,
          notes: trip.notes ?? "",
        }}
      />
    </div>
  );
}
