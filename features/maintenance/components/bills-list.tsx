"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Paperclip, Wrench } from "lucide-react";
import Link from "next/link";

import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { formatZarAmount } from "@/features/invoices/lib/invoice-print-format";
import { BillStatusBadge } from "@/features/maintenance/components/bill-status-badge";
import type { BillListRow } from "@/features/maintenance/types";
import { formatDate } from "@/utils/format";

const columns: ColumnDef<BillListRow, unknown>[] = [
  {
    id: "bill",
    header: "Bill",
    cell: ({ row }) => (
      <Link href={`/maintenance/bills/${row.original.id}`} className="block min-w-0 hover:underline">
        <span className="block truncate font-medium">{row.original.supplier_name}</span>
        <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
          {row.original.invoice_ref}
          {row.original.has_attachment ? (
            <Paperclip className="size-3.5 shrink-0" aria-label="Has attachment" />
          ) : null}
        </span>
      </Link>
    ),
  },
  {
    accessorKey: "bill_date",
    header: "Date",
    cell: ({ row }) => formatDate(row.original.bill_date),
  },
  {
    id: "vehicle",
    header: "Vehicle",
    cell: ({ row }) => row.original.vehicle_label ?? "—",
  },
  {
    accessorKey: "total_incl",
    header: "Total incl. VAT",
    cell: ({ row }) => <span className="tabular-nums">{formatZarAmount(row.original.total_incl)}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <BillStatusBadge status={row.original.status} />,
  },
];

export function BillsList({ bills, canManage }: { bills: BillListRow[]; canManage: boolean }) {
  if (bills.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="No workshop bills yet"
        description="Capture supplier bills for repairs, services and parts."
        action={
          canManage ? (
            <Button size="lg" render={<Link href="/maintenance/bills/new" />}>
              Add workshop bill
            </Button>
          ) : undefined
        }
      />
    );
  }
  return <DataTable columns={columns} data={bills} emptyMessage="No workshop bills." />;
}
