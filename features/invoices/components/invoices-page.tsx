"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextField } from "@/components/forms/form-fields";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  generatePeriodInvoiceSchema,
  type GeneratePeriodInvoiceValues,
} from "@/features/invoices/schemas/invoice";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import { INVOICE_LINE_TYPE_LABELS } from "@/lib/constants";
import {
  generatePeriodInvoice,
  listInvoiceLines,
  listInvoices,
  mondayOfWeek,
  setInvoiceStatus,
  weekPeriodEnd,
} from "@/services/invoices.service";
import type { Invoice, InvoiceLine } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { formatDate } from "@/utils/format";
import { queryKeys } from "@/utils/query";

function GeneratePeriodInvoiceForm({
  organisationId,
  onDone,
}: {
  organisationId: string;
  onDone: () => void;
}) {
  const { companies } = useEntityOptions(organisationId);
  const weekStart = mondayOfWeek();
  const form = useForm<GeneratePeriodInvoiceValues>({
    resolver: zodResolver(generatePeriodInvoiceSchema),
    defaultValues: {
      company_id: "",
      period_start: weekStart,
      period_end: weekPeriodEnd(weekStart),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: GeneratePeriodInvoiceValues) =>
      generatePeriodInvoice(
        organisationId,
        values.company_id,
        values.period_start,
        values.period_end
      ),
    onSuccess: (invoice) => {
      toast.success(
        `Invoice ${invoice.status} — total ${invoice.currency} ${invoice.total}`
      );
      onDone();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
    >
      <SelectField
        control={form.control}
        name="company_id"
        label="Company"
        options={companies}
      />
      <TextField
        control={form.control}
        name="period_start"
        label="Period start"
        type="date"
      />
      <TextField
        control={form.control}
        name="period_end"
        label="Period end (exclusive)"
        type="date"
      />
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? "Generating…" : "Generate period invoice"}
      </Button>
    </form>
  );
}

export function InvoicesPage({
  title = "Invoices",
  description = "Company invoices from fuel, trips, and rate cards.",
  printBasePath = "/invoices",
}: {
  title?: string;
  description?: string;
  /** Base path for print view links (`/invoices` or `/company/invoices`). */
  printBasePath?: string;
} = {}) {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const canView = can("invoices:view");
  const canManage = can("invoices:manage");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const invoicesQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.invoices(organisationId)
      : ["invoices", "none"],
    queryFn: () => listInvoices(organisationId!),
    enabled: Boolean(organisationId) && canView,
  });

  const linesQuery = useQuery({
    queryKey:
      organisationId && selectedId
        ? queryKeys.invoiceLines(organisationId, selectedId)
        : ["invoice-lines", "none"],
    queryFn: () => listInvoiceLines(organisationId!, selectedId!),
    enabled: Boolean(organisationId && selectedId),
  });

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: Invoice["status"];
    }) => setInvoiceStatus(id, status),
    onSuccess: async () => {
      toast.success("Invoice status updated");
      if (organisationId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.invoices(organisationId),
        });
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const columns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      {
        id: "company",
        header: "Company",
        cell: ({ row }) =>
          row.original.companies?.name ?? row.original.company_id.slice(0, 8),
      },
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
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const inv = row.original;
          return (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedId(inv.id)}
              >
                Lines
              </Button>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href={`${printBasePath}/${inv.id}/print`} />}
              >
                Print
              </Button>
              {canManage && inv.status === "issued" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({ id: inv.id, status: "paid" })
                  }
                >
                  Mark paid
                </Button>
              ) : null}
              {canManage &&
              (inv.status === "draft" || inv.status === "issued") ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({ id: inv.id, status: "void" })
                  }
                >
                  Void
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canManage, printBasePath, statusMutation]
  );

  const lineColumns = useMemo<ColumnDef<InvoiceLine, unknown>[]>(
    () => [
      {
        id: "line_type",
        header: "Type",
        cell: ({ row }) =>
          INVOICE_LINE_TYPE_LABELS[row.original.line_type] ??
          row.original.line_type,
      },
      { accessorKey: "description", header: "Description" },
      { accessorKey: "quantity", header: "Qty" },
      { accessorKey: "unit_price", header: "Unit" },
      { accessorKey: "amount", header: "Amount" },
    ],
    []
  );

  if (!canView) {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <EmptyState
          title="No access"
          description="You do not have permission to view invoices."
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
          canManage && organisationId ? (
            <Button onClick={() => setOpen(true)}>Generate period</Button>
          ) : null
        }
      />

      {!organisationId ? (
        <EmptyState
          title="No organisation"
          description="Select an organisation to view invoices."
        />
      ) : invoicesQuery.isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <DataTable
          columns={columns}
          data={invoicesQuery.data ?? []}
          emptyMessage="No invoices yet. Generate a period invoice for a company."
        />
      )}

      {selectedId ? (
        <div className="mt-8 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-xl">Invoice lines</h2>
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
              Close
            </Button>
          </div>
          {linesQuery.isLoading ? (
            <LoadingSkeleton rows={3} />
          ) : (
            <DataTable
              columns={lineColumns}
              data={linesQuery.data ?? []}
              emptyMessage="No lines on this invoice."
            />
          )}
        </div>
      ) : null}

      {organisationId ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Generate period invoice"
          description="Builds fuel, trip, and fixed-fee lines. Idempotent for the same company and period."
        >
          <GeneratePeriodInvoiceForm
            organisationId={organisationId}
            onDone={async () => {
              setOpen(false);
              await queryClient.invalidateQueries({
                queryKey: queryKeys.invoices(organisationId),
              });
            }}
          />
        </FormDialog>
      ) : null}
    </div>
  );
}
