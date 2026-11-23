"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Store } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import type { SupplierRow } from "@/features/maintenance/types";

const columns: ColumnDef<SupplierRow, unknown>[] = [
  {
    accessorKey: "name",
    header: "Supplier",
    cell: ({ row }) => <span className="font-medium break-words">{row.original.name}</span>,
  },
  { id: "vat_number", header: "VAT number", cell: ({ row }) => row.original.vat_number ?? "—" },
  { id: "contact_phone", header: "Phone", cell: ({ row }) => row.original.contact_phone ?? "—" },
  {
    id: "email",
    header: "Email",
    cell: ({ row }) => <span className="break-all">{row.original.email ?? "—"}</span>,
  },
  {
    id: "active",
    header: "Status",
    cell: ({ row }) =>
      row.original.active ? <Badge variant="default">Active</Badge> : <Badge variant="secondary">Inactive</Badge>,
  },
];

export function SuppliersList({ suppliers, action }: { suppliers: SupplierRow[]; action?: React.ReactNode }) {
  if (suppliers.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="No suppliers yet"
        description="Add the workshops and parts suppliers you get bills from."
        action={action}
      />
    );
  }
  return <DataTable columns={columns} data={suppliers} emptyMessage="No suppliers." />;
}
