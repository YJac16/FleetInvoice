"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Truck } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { PricingStatusBadge } from "@/features/pricing/components/pricing-status-badge";
import { TripStatusBadge } from "@/features/trips/components/trip-status-badge";
import { ROUTES } from "@/lib/constants";
import { formatTripTime } from "@/lib/trips/filters";
import { formatRuleLabel } from "@/lib/pricing/engine";
import type { AdminTripWithDetails } from "@/types/database";
import { formatRand } from "@/utils/currency";

interface AdminTripsClientProps {
  trips: AdminTripWithDetails[];
}

export function AdminTripsClient({ trips }: AdminTripsClientProps) {
  const columns = useMemo<ColumnDef<AdminTripWithDetails>[]>(
    () => [
      {
        accessorKey: "trip_date",
        header: "Date",
      },
      {
        id: "time",
        header: "Time",
        cell: ({ row }) => formatTripTime(row.original.trip_time),
      },
      {
        accessorKey: "company_name",
        header: "Company",
      },
      {
        accessorKey: "driver_name",
        header: "Driver",
      },
      {
        accessorKey: "passengers",
        header: "Passengers",
      },
      {
        accessorKey: "pickup_area",
        header: "Pickup",
      },
      {
        accessorKey: "destination_area",
        header: "Destination",
      },
      {
        id: "price",
        header: "Calculated price",
        cell: ({ row }) => (
          <span className="font-medium">
            {formatRand(row.original.calculated_price)}
          </span>
        ),
      },
      {
        id: "trip_status",
        header: "Status",
        cell: ({ row }) => <TripStatusBadge status={row.original.status} />,
      },
      {
        id: "pricing_status",
        header: "Pricing",
        cell: ({ row }) => (
          <PricingStatusBadge status={row.original.pricing_status} />
        ),
      },
      {
        id: "rule",
        header: "Pricing rule",
        cell: ({ row }) => formatRuleLabel(row.original.pricing_rule_id),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            render={<Link href={ROUTES.tripDetail(row.original.id)} />}
            size="sm"
            variant="outline"
          >
            View
          </Button>
        ),
      },
    ],
    []
  );

  const needsPricingCount = trips.filter(
    (trip) => trip.pricing_status === "needs_pricing"
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trips"
        description="Hidden calculated prices for invoice preparation. Drivers cannot see these amounts."
      />

      {needsPricingCount > 0 ? (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-800 dark:text-orange-300">
          {needsPricingCount} trip
          {needsPricingCount === 1 ? "" : "s"} need pricing. Add or adjust
          pricing rules, then edit pending trips to recalculate.
        </div>
      ) : null}

      {trips.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No trips yet"
          description="When drivers submit trips, calculated prices appear here."
        />
      ) : (
        <DataTable columns={columns} data={trips} />
      )}
    </div>
  );
}
