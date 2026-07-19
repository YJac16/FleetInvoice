import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { TripForm } from "@/features/trips/components/trip-form";
import { ROUTES } from "@/lib/constants";
import { hasSupabaseConfig } from "@/lib/env";
import { getTripLookupOptions } from "@/services/lookups.service";
import {
  getDemoSessionContext,
  getSessionContext,
} from "@/services/profile.service";

export const metadata: Metadata = {
  title: "New Trip",
};

export default async function NewTripPage() {
  const [lookups, session] = await Promise.all([
    getTripLookupOptions(),
    getSessionContext(),
  ]);

  const resolved =
    session ?? (!hasSupabaseConfig() ? getDemoSessionContext() : null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Trip"
        description="Log a completed trip. Pricing is never shown to drivers."
        actions={
          <Button
            variant="outline"
            render={<Link href={ROUTES.trips} />}
            className="min-h-11"
          >
            <ArrowLeft />
            My Trips
          </Button>
        }
      />
      <TripForm
        mode="create"
        lookups={lookups}
        defaultVehicleId={resolved?.defaultVehicleId}
      />
    </div>
  );
}
