"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";

import { useOrg } from "@/components/layout/org-context";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { listFuelFillups } from "@/services/fuel-fillups.service";
import type { FuelFillup } from "@/types";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

export function FuelFillupsPage({
  title = "Fuel",
  description = "Review fuel slip rows. Capture uses the driver slip flow or admin back-capture API.",
}: {
  title?: string;
  description?: string;
} = {}) {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canView =
    can("fuel:view") ||
    can("fuel:view_rows") ||
    can("fuel:view_approved_scoped") ||
    can("fuel:manage") ||
    can("fuel:self") ||
    can("fuel:review");
  const canReview = can("fuel:review");

  const fillupsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.fuelFillups(organisationId)
      : ["fuel-fillups", "none"],
    queryFn: () => listFuelFillups(organisationId!),
    enabled: Boolean(organisationId) && canView,
  });

  const columns = useMemo<ColumnDef<FuelFillup, unknown>[]>(
    () => [
      {
        id: "vehicle",
        header: "Vehicle",
        cell: ({ row }) =>
          row.original.vehicles?.name ?? row.original.vehicle_id.slice(0, 8),
      },
      {
        id: "company",
        header: "Company",
        cell: ({ row }) => row.original.companies?.name ?? "—",
      },
      {
        accessorKey: "odometer_km",
        header: "Odometer (km)",
      },
      { accessorKey: "litres", header: "Litres" },
      {
        accessorKey: "total_amount",
        header: "Amount",
        cell: ({ row }) =>
          row.original.total_amount != null
            ? `${row.original.currency} ${row.original.total_amount}`
            : "—",
      },
      {
        accessorKey: "filled_at",
        header: "Filled at",
        cell: ({ row }) => formatDateTime(row.original.filled_at),
      },
    ],
    []
  );

  if (!canView) {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <EmptyState
          title="No access"
          description="You do not have permission to view fuel records."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          canReview && organisationId ? (
            <Link href="/fuel/review" className="inline-flex">
              <Button variant="outline" type="button">
                Review queue
              </Button>
            </Link>
          ) : null
        }
      />

      {!organisationId ? (
        <EmptyState
          title="No organisation"
          description="Select an organisation to view fuel fill-ups."
        />
      ) : fillupsQuery.isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <DataTable
          columns={columns}
          data={fillupsQuery.data ?? []}
          emptyMessage="No fill-ups yet."
        />
      )}
    </div>
  );
}
