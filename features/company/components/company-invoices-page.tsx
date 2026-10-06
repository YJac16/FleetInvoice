"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import { useOrg } from "@/components/layout/org-context";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { listInvoices } from "@/services/invoices.service";
import type { Invoice } from "@/types";
import { formatDate } from "@/utils/format";
import { queryKeys } from "@/utils/query";

export function CompanyInvoicesPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canView = can("invoices:view");

  const invoicesQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.invoices(organisationId)
      : ["invoices", "none"],
    queryFn: () => listInvoices(organisationId!),
    enabled: Boolean(organisationId) && canView,
  });

  const invoices = useMemo(
    () =>
      (invoicesQuery.data ?? []).filter((invoice) => invoice.driver_id == null),
    [invoicesQuery.data]
  );

  const columns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      {
        id: "period",
        header: "Period",
        cell: ({ row }) =>
          `${formatDate(row.original.period_start)} → ${formatDate(row.original.period_end)}`,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "total",
        header: "Total",
        cell: ({ row }) =>
          `${row.original.currency} ${row.original.total}`,
      },
      {
        id: "print",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link href={`/company/invoices/${row.original.id}/print`} />
            }
          >
            Print
          </Button>
        ),
      },
    ],
    []
  );

  if (!canView) {
    return (
      <div>
        <PageHeader
          title="Invoices"
          description="Invoices for your company."
        />
        <EmptyState
          title="No access"
          description="You do not have permission to view invoices."
        />
      </div>
    );
  }

  if (!organisationId) {
    return (
      <div>
        <PageHeader
          title="Invoices"
          description="Invoices for your company."
        />
        <EmptyState
          title="No organisation"
          description="Select an organisation to view invoices."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Read-only invoices for your company. Open Print for a browser PDF."
      />
      {invoicesQuery.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <DataTable
          columns={columns}
          data={invoices}
          emptyMessage="No invoices for your company yet."
        />
      )}
    </div>
  );
}
