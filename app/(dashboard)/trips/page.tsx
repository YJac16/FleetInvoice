import type { Metadata } from "next";

import { AdminTripsClient } from "@/features/pricing/components/admin-trips-client";
import { MyTripsClient } from "@/features/trips/components/my-trips-client";
import { hasSupabaseConfig } from "@/lib/env";
import { listAdminTrips } from "@/services/admin-trips.service";
import {
  getDemoAdminSessionContext,
  getDemoSessionContext,
  getSessionContext,
} from "@/services/profile.service";
import { listMyTrips } from "@/services/trips.service";

export const metadata: Metadata = {
  title: "Trips",
};

export default async function TripsPage() {
  const session =
    (await getSessionContext()) ??
    (!hasSupabaseConfig()
      ? process.env.NEXT_PUBLIC_DEMO_ROLE === "admin"
        ? getDemoAdminSessionContext()
        : getDemoSessionContext()
      : null);

  if (session?.role === "admin") {
    const trips = await listAdminTrips();
    return <AdminTripsClient trips={trips} />;
  }

  const trips = await listMyTrips();
  return <MyTripsClient trips={trips} />;
}
