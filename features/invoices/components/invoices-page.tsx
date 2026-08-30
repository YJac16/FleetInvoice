/* WorkOps invoices */
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
  generateDriverWeeklyInvoiceSchema,
  type GenerateDriverWeeklyInvoiceValues,
} from "@/features/invoices/schemas/invoice";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { INVOICE_LINE_TYPE_LABELS } from "@/lib/constants";
import { listDrivers } from "@/services/drivers.service";
import {
  generateDriverWeeklyInvoice,
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

function GenerateDriverWeeklyInvoiceForm({
  organisationId,
  onDone,
}: {
  organisationId: string;
  onDone: () => void;
}) {
  const weekStart = mondayOfWeek();
  const form = useForm<GenerateDriverWeeklyInvoiceValues>({
    resolver: zodResolver(generateDriverWeeklyInvoiceSchema),
    defaultValues: {
      driver_id: "",
      period_start: weekStart,
      period_end: weekPeriodEnd(weekStart),
    },
  });

  const driversQuery = useQuery({
    queryKey: queryKeys.drivers(organisationId),
    queryFn: () => listDrivers(organisationId),
  });

  const driverOptions = useMemo(
    () =>
      (driversQuery.data ?? []).map((driver) => ({
        label: driver.full_name,
        value: driver.id,
      })),
    [driversQuery.data]
  );

  const mutation = useMutation({
    mutationFn: (values: GenerateDriverWeeklyInvoiceValues) =>
      generateDriverWeeklyInvoice(
        organisationId,
        values.driver_id,
        values.period_start,
        values.period_end
      ),
    onSuccess: (invoice) => {
      toast.success(
        `Draft invoice — total ${invoice.currency} ${invoice.total}`
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
        name="driver_id"
        label="Driver"
        options={driverOptions}
        placeholder={driversQuery.isLoading ? "Loading drivers…" : "Select driver"}
      />
      <TextField
        control={form.control}
        name="period_start"
        label="Week start (Monday)"
        type="date"
      />
      <TextField
        control={form.control}
        name="period_end"
        label="Week end (exclusive)"
        type="date"
      />
      <Button
        type="submit"
        className="w-full"
        disabled={mutation.isPending || driversQuery.isLoading}
      >
        {mutation.isPending ? "Generating…" : "Generate weekly invoice"}
      </Button>
    </form>
  );
}

export function InvoicesPage({
  title = "Invoices",
  description = "Driver weekly invoices billed to WCL — trip lines from all companies.",
  printBasePath = "/invoices",
  showGenerate = true,
}: {
  title?: string;
  description?: string;
  printBasePath?: string;
  showGenerate?: boolean;
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
        id: "driver",
        header: "Driver",
        cell: ({ row }) =>
          row.original.drivers?.full_name ??
          (row.original.driver_id
            ? row.original.driver_id.slice(0, 8)
            : "\u2014"),
      },
      {
        id: "bill_to",
        header: "Bill to",
        cell: ({ row }) =>
          row.original.companies?.name ?? row.original.company_id.slice(0, 8),
      },
      {
        id: "period",
        header: "Period",
        cell: ({ row }) =>
          `${formatDate(row.original.period_start)} \u2192 ${formatDate(row.original.period_end)}`,
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
          showGenerate && canManage && organisationId ? (
            <Button onClick={() => setOpen(true)}>Generate weekly invoice</Button>
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
          emptyMessage="No invoices yet. Generate a weekly invoice for a driver."
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

      {showGenerate && organisationId ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Generate weekly invoice"
          description="One draft invoice per driver per week. All companies appear as trip lines; bill-to is WCL Trading CC."
        >
          <GenerateDriverWeeklyInvoiceForm
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
