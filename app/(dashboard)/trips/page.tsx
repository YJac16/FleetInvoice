import type { Metadata } from "next";

import { MyTripsClient } from "@/features/trips/components/my-trips-client";
import { listMyTrips } from "@/services/trips.service";

export const metadata: Metadata = {
  title: "My Trips",
};

export default async function TripsPage() {
  const trips = await listMyTrips();
  return <MyTripsClient trips={trips} />;
}
