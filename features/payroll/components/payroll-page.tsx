"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { FormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/form-fields";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  generatePayrollSchema,
  type GeneratePayrollValues,
} from "@/features/payroll/schemas/payroll";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { PAYROLL_LINE_TYPE_LABELS } from "@/lib/constants";
import {
  finalizePayrollRun,
  generatePayrollRun,
  listPayrollLines,
  listPayrollRuns,
  mondayOfWeek,
  voidPayrollRun,
  weekPeriodEnd,
} from "@/services/payroll.service";
import type { PayrollLine, PayrollRun } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { formatDate } from "@/utils/format";
import { queryKeys } from "@/utils/query";

function GeneratePayrollForm({
  organisationId,
  onDone,
}: {
  organisationId: string;
  onDone: () => void;
}) {
  const weekStart = mondayOfWeek();
  const form = useForm<GeneratePayrollValues>({
    resolver: zodResolver(generatePayrollSchema),
    defaultValues: {
      period_start: weekStart,
      period_end: weekPeriodEnd(weekStart),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: GeneratePayrollValues) =>
      generatePayrollRun(
        organisationId,
        values.period_start,
        values.period_end
      ),
    onSuccess: (run) => {
      toast.success(
        `Payroll ${run.status} — total ${run.currency} ${run.total}`
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
        {mutation.isPending ? "Generating…" : "Generate payroll run"}
      </Button>
    </form>
  );
}

export function PayrollPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const canView = can("payroll:view");
  const canManage = can("payroll:manage");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.payrollRuns(organisationId)
      : ["payroll-runs", "none"],
    queryFn: () => listPayrollRuns(organisationId!),
    enabled: Boolean(organisationId) && canView,
  });

  const linesQuery = useQuery({
    queryKey:
      organisationId && selectedId
        ? queryKeys.payrollLines(organisationId, selectedId)
        : ["payroll-lines", "none"],
    queryFn: () => listPayrollLines(organisationId!, selectedId!),
    enabled: Boolean(organisationId && selectedId),
  });

  const actionMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "finalize" | "void";
    }) =>
      action === "finalize" ? finalizePayrollRun(id) : voidPayrollRun(id),
    onSuccess: async (_, vars) => {
      toast.success(
        vars.action === "finalize" ? "Payroll finalized" : "Payroll voided"
      );
      if (organisationId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.payrollRuns(organisationId),
        });
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const columns = useMemo<ColumnDef<PayrollRun, unknown>[]>(
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
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const run = row.original;
          return (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedId(run.id)}
              >
                Lines
              </Button>
              {canManage && run.status === "draft" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionMutation.isPending}
                  onClick={() =>
                    actionMutation.mutate({ id: run.id, action: "finalize" })
                  }
                >
                  Finalize
                </Button>
              ) : null}
              {canManage && run.status !== "void" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={actionMutation.isPending}
                  onClick={() =>
                    actionMutation.mutate({ id: run.id, action: "void" })
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
    [actionMutation, canManage]
  );

  const lineColumns = useMemo<ColumnDef<PayrollLine, unknown>[]>(
    () => [
      {
        id: "line_type",
        header: "Type",
        cell: ({ row }) =>
          PAYROLL_LINE_TYPE_LABELS[row.original.line_type] ??
          row.original.line_type,
      },
      {
        id: "subject",
        header: "Person",
        cell: ({ row }) =>
          row.original.drivers?.full_name ??
          row.original.employees?.full_name ??
          "—",
      },
      { accessorKey: "description", header: "Description" },
      { accessorKey: "quantity", header: "Qty" },
      { accessorKey: "unit_amount", header: "Unit" },
      { accessorKey: "amount", header: "Amount" },
    ],
    []
  );

  if (!canView) {
    return (
      <div>
        <PageHeader
          title="Payroll"
          description="Driver and employee payroll runs."
        />
        <EmptyState
          title="No access"
          description="You do not have permission to view payroll."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Generate draft runs from completed trips and boardings, then finalize."
        actions={
          canManage && organisationId ? (
            <Button onClick={() => setOpen(true)}>Generate period</Button>
          ) : null
        }
      />

      {!organisationId ? (
        <EmptyState
          title="No organisation"
          description="Select an organisation to view payroll."
        />
      ) : runsQuery.isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <DataTable
          columns={columns}
          data={runsQuery.data ?? []}
          emptyMessage="No payroll runs yet. Add pay rates, then generate a period."
        />
      )}

      {selectedId ? (
        <div className="mt-8 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-xl">Payroll lines</h2>
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
              emptyMessage="No lines on this run."
            />
          )}
        </div>
      ) : null}

      {organisationId ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title="Generate payroll run"
          description="Builds trip, boarding, and fixed lines. Idempotent for the same period."
        >
          <GeneratePayrollForm
            organisationId={organisationId}
            onDone={async () => {
              setOpen(false);
              await queryClient.invalidateQueries({
                queryKey: queryKeys.payrollRuns(organisationId),
              });
            }}
          />
        </FormDialog>
      ) : null}
    </div>
  );
}
