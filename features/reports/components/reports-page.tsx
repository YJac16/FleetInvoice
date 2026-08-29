"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Building2,
  Car,
  CircleUser,
  Download,
  MapPinned,
  Users,
  UsersRound,
  Warehouse,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { SelectField, TextField } from "@/components/forms/form-fields";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { mondayOfWeek, weekPeriodEnd } from "@/features/invoices/lib/week";
import { downloadCsv, toCsv } from "@/features/reports/lib/csv";
import {
  REPORT_TYPE_LABELS,
  REPORT_TYPES,
  reportFilterSchema,
  type ReportFilterValues,
  type ReportType,
} from "@/features/reports/schemas/report";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  ATTENDANCE_EVENT_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  PAYROLL_RUN_STATUS_LABELS,
  TRIP_STATUS_LABELS,
  type AttendanceEventTypeConst,
  type InvoiceStatus,
  type PayrollRunStatus,
  type TripStatus,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/utils/format";
import { getDashboardCounts } from "@/services/dashboard.service";
import {
  buildOpsReport,
  reportToCsvRows,
  type AttendanceReport,
  type CommercialReport,
  type FuelReport,
  type OpsReport,
  type TripsReport,
} from "@/services/reports.service";
import { queryKeys } from "@/utils/query";

function tripStatusLabel(status: string) {
  return TRIP_STATUS_LABELS[status as TripStatus] ?? status.replaceAll("_", " ");
}

function TripsResults({ report }: { report: TripsReport }) {
  const columns = useMemo<ColumnDef<(typeof report.rows)[number], unknown>[]>(
    () => [
      {
        accessorKey: "planned_start",
        header: "Planned start",
        cell: ({ row }) => formatDateTime(row.original.planned_start),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => tripStatusLabel(row.original.status),
      },
      { accessorKey: "route", header: "Route" },
    ],
    []
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        {Object.entries(report.statusCounts).map(([status, count]) => (
          <span key={status} className="rounded-md bg-muted px-2 py-1">
            {tripStatusLabel(status)}: {count}
          </span>
        ))}
      </div>
      <DataTable
        columns={columns}
        data={report.rows}
        emptyMessage="No trips in this period."
      />
    </div>
  );
}

function FuelResults({ report }: { report: FuelReport }) {
  const columns = useMemo<ColumnDef<(typeof report.rows)[number], unknown>[]>(
    () => [
      {
        accessorKey: "filled_at",
        header: "Filled at",
        cell: ({ row }) => formatDateTime(row.original.filled_at),
      },
      { accessorKey: "vehicle", header: "Vehicle" },
      { accessorKey: "company", header: "Company" },
      { accessorKey: "litres", header: "Litres" },
      { accessorKey: "total_amount", header: "Amount" },
    ],
    []
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <span className="rounded-md bg-muted px-2 py-1">
          Total litres: {report.totalLitres.toFixed(2)}
        </span>
        <span className="rounded-md bg-muted px-2 py-1">
          Total amount: {report.totalAmount.toFixed(2)}
        </span>
      </div>
      <DataTable
        columns={columns}
        data={report.rows}
        emptyMessage="No fuel fill-ups in this period."
      />
    </div>
  );
}

function AttendanceResults({ report }: { report: AttendanceReport }) {
  const columns = useMemo<ColumnDef<(typeof report.rows)[number], unknown>[]>(
    () => [
      {
        accessorKey: "created_at",
        header: "When",
        cell: ({ row }) => formatDateTime(row.original.created_at),
      },
      { accessorKey: "employee", header: "Employee" },
      { accessorKey: "trip", header: "Trip" },
      {
        accessorKey: "event_type",
        header: "Event",
        cell: ({ row }) =>
          ATTENDANCE_EVENT_TYPE_LABELS[
            row.original.event_type as AttendanceEventTypeConst
          ] ?? row.original.event_type,
      },
    ],
    []
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Boardings: {report.boardingCount}
      </p>
      <DataTable
        columns={columns}
        data={report.rows}
        emptyMessage="No boardings in this period."
      />
    </div>
  );
}

function CommercialResults({ report }: { report: CommercialReport }) {
  const invoiceColumns = useMemo<
    ColumnDef<(typeof report.invoiceRows)[number], unknown>[]
  >(
    () => [
      { accessorKey: "company", header: "Company" },
      {
        accessorKey: "period_start",
        header: "Start",
        cell: ({ row }) => formatDate(row.original.period_start),
      },
      {
        accessorKey: "period_end",
        header: "End",
        cell: ({ row }) => formatDate(row.original.period_end),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) =>
          INVOICE_STATUS_LABELS[row.original.status as InvoiceStatus] ??
          row.original.status,
      },
      { accessorKey: "total", header: "Total" },
    ],
    []
  );
  const payrollColumns = useMemo<
    ColumnDef<(typeof report.payrollRows)[number], unknown>[]
  >(
    () => [
      {
        accessorKey: "period_start",
        header: "Start",
        cell: ({ row }) => formatDate(row.original.period_start),
      },
      {
        accessorKey: "period_end",
        header: "End",
        cell: ({ row }) => formatDate(row.original.period_end),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) =>
          PAYROLL_RUN_STATUS_LABELS[
            row.original.status as PayrollRunStatus
          ] ?? row.original.status,
      },
      { accessorKey: "total", header: "Total" },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <span className="rounded-md bg-muted px-2 py-1">
          Invoices: {report.invoiceCount} (issued{" "}
          {report.invoiceIssuedTotal.toFixed(2)} / paid{" "}
          {report.invoicePaidTotal.toFixed(2)})
        </span>
        <span className="rounded-md bg-muted px-2 py-1">
          Payroll runs: {report.payrollCount} (finalized{" "}
          {report.payrollFinalizedTotal.toFixed(2)})
        </span>
      </div>
      <div className="space-y-2">
        <h3 className="font-heading text-lg">Invoices</h3>
        <DataTable
          columns={invoiceColumns}
          data={report.invoiceRows}
          emptyMessage="No invoices in this period."
        />
      </div>
      <div className="space-y-2">
        <h3 className="font-heading text-lg">Payroll</h3>
        <DataTable
          columns={payrollColumns}
          data={report.payrollRows}
          emptyMessage="No payroll runs in this period."
        />
      </div>
    </div>
  );
}

function ReportResults({ report }: { report: OpsReport }) {
  switch (report.type) {
    case "trips":
      return <TripsResults report={report} />;
    case "fuel":
      return <FuelResults report={report} />;
    case "attendance":
      return <AttendanceResults report={report} />;
    case "commercial":
      return <CommercialResults report={report} />;
    default: {
      const _exhaustive: never = report;
      return _exhaustive;
    }
  }
}

export function ReportsPage({
  title = "Reports",
  description = "Period reports with CSV export for trips, fuel, attendance, and commercial summaries.",
  showMasterCounts = true,
}: {
  title?: string;
  description?: string;
  showMasterCounts?: boolean;
} = {}) {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canView = can("reports:view");
  const weekStart = mondayOfWeek();

  const [applied, setApplied] = useState<{
    report_type: ReportType;
    period_start: string;
    period_end: string;
  } | null>({
    report_type: "trips",
    period_start: weekStart,
    period_end: weekPeriodEnd(weekStart),
  });

  const form = useForm<ReportFilterValues>({
    resolver: zodResolver(reportFilterSchema),
    defaultValues: {
      report_type: "trips",
      period_start: weekStart,
      period_end: weekPeriodEnd(weekStart),
    },
  });

  const countsQuery = useQuery({
    queryKey: organisationId
      ? [...queryKeys.dashboard(organisationId), "reports"]
      : ["reports", "none"],
    queryFn: () => getDashboardCounts(organisationId!),
    enabled: Boolean(organisationId) && canView && showMasterCounts,
  });

  const reportQuery = useQuery({
    queryKey:
      organisationId && applied
        ? queryKeys.opsReport(
            organisationId,
            applied.report_type,
            applied.period_start,
            applied.period_end
          )
        : ["ops-report", "none"],
    queryFn: () =>
      buildOpsReport(organisationId!, applied!.report_type, {
        periodStart: applied!.period_start,
        periodEnd: applied!.period_end,
      }),
    enabled: Boolean(organisationId) && canView && Boolean(applied),
  });

  if (!canView) {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <EmptyState
          title="No access"
          description="You do not have permission to view reports."
        />
      </div>
    );
  }

  if (!organisationId) {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <EmptyState
          title="Select an organisation"
          description="Choose an organisation from the switcher to view reports."
        />
      </div>
    );
  }

  const counts = countsQuery.data;

  return (
    <div className="space-y-8">
      <PageHeader
        title={title}
        description={description}
        actions={
          reportQuery.data ? (
            <Button
              variant="outline"
              onClick={() => {
                const { headers, rows, filename } = reportToCsvRows(
                  reportQuery.data!
                );
                downloadCsv(filename, toCsv(headers, rows));
              }}
            >
              <Download className="mr-2 size-4" />
              Download CSV
            </Button>
          ) : null
        }
      />

      <form
        className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={form.handleSubmit((values) => {
          setApplied({
            report_type: values.report_type,
            period_start: values.period_start,
            period_end: values.period_end,
          });
        })}
      >
        <SelectField
          control={form.control}
          name="report_type"
          label="Report"
          options={REPORT_TYPES.map((t) => ({
            value: t,
            label: REPORT_TYPE_LABELS[t],
          }))}
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
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Run report
          </Button>
        </div>
      </form>

      {reportQuery.isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : reportQuery.data ? (
        <ReportResults report={reportQuery.data} />
      ) : (
        <EmptyState
          title="No report yet"
          description="Choose a report type and period, then run."
        />
      )}

      {showMasterCounts ? (
        <div className="space-y-3">
          <h2 className="font-heading text-xl">At a glance</h2>
          {countsQuery.isLoading ? (
            <LoadingSkeleton rows={2} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Drivers"
                value={counts?.drivers ?? 0}
                icon={CircleUser}
              />
              <StatCard
                title="Employees"
                value={counts?.employees ?? 0}
                icon={UsersRound}
              />
              <StatCard
                title="Vehicles"
                value={counts?.vehicles ?? 0}
                icon={Car}
              />
              <StatCard
                title="Companies"
                value={counts?.companies ?? 0}
                icon={Building2}
              />
              <StatCard
                title="Sites"
                value={counts?.sites ?? 0}
                icon={Warehouse}
              />
              <StatCard
                title="Pickup points"
                value={counts?.pickup_points ?? 0}
                icon={MapPinned}
              />
              <StatCard title="Users" value={counts?.users ?? 0} icon={Users} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
