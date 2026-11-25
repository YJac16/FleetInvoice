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
import { Badge } from "@/components/ui/badge";
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
import { visibleReportKinds } from "@/features/reports/lib/report-kinds";
import {
  OwnerSplitPanel,
  type OwnerSplitMetric,
} from "@/features/reports/components/owner-split-panel";
import { OWNER_FILTER_LABELS, OWNER_FILTERS, OWNER_LABELS, type OwnerFilter } from "@/lib/owner-tag";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { fuelTypeLabel } from "@/lib/fuel/fuel-types";
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
      { accessorKey: "owner", header: "Owner", cell: ({ row }) => OWNER_LABELS[row.original.owner] },
      { accessorKey: "entered_by", header: "Entered by" },
      {
        accessorKey: "updated_by",
        header: "Last edited by",
        cell: ({ row }) =>
          row.original.updated_by && row.original.updated_by !== row.original.entered_by
            ? row.original.updated_by
            : "—",
      },
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

export function FuelResults({
  report,
  showAmounts = false,
}: {
  report: FuelReport;
  showAmounts?: boolean;
}) {
  const columns = useMemo<ColumnDef<(typeof report.rows)[number], unknown>[]>(
    () => [
      {
        accessorKey: "filled_at",
        header: "Filled at",
        cell: ({ row }) => formatDateTime(row.original.filled_at),
      },
      { accessorKey: "vehicle", header: "Vehicle" },
      { accessorKey: "company", header: "Company" },
      { accessorKey: "driver", header: "Driver" },
      { accessorKey: "fuel_type", header: "Fuel type", cell: ({ row }) => fuelTypeLabel(row.original.fuel_type) },
      { accessorKey: "odometer_km", header: "Odometer (km)" },
      { accessorKey: "litres", header: "Litres" },
      { accessorKey: "owner", header: "Owner", cell: ({ row }) => OWNER_LABELS[row.original.owner] },
      ...(showAmounts
        ? [
            {
              accessorKey: "total_amount",
              header: "Amount",
              cell: ({ row }: { row: { original: FuelReport["rows"][number] } }) =>
                row.original.price_status === "needs_price" ? (
                  <Badge variant="destructive">Needs price</Badge>
                ) : row.original.total_amount != null ? (
                  Number(row.original.total_amount).toFixed(2)
                ) : (
                  "—"
                ),
            } as ColumnDef<FuelReport["rows"][number], unknown>,
          ]
        : []),
    ],
    [showAmounts]
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <span className="rounded-md bg-muted px-2 py-1">
          Total litres: {report.totalLitres.toFixed(2)}
        </span>
        {showAmounts ? (
          <>
            <span className="rounded-md bg-muted px-2 py-1">
              Total amount: {report.totalAmount.toFixed(2)}
            </span>
            <span className="rounded-md bg-muted px-2 py-1">
              Needs price: {report.needsPriceCount} (not in total)
            </span>
          </>
        ) : null}
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

function CommercialResults({
  report,
  hidePayroll = false,
}: {
  report: CommercialReport;
  hidePayroll?: boolean;
}) {
  const invoiceColumns = useMemo<
    ColumnDef<(typeof report.invoiceRows)[number], unknown>[]
  >(
    () => [
      { accessorKey: "company", header: "Company" },
      { accessorKey: "owner", header: "Owner", cell: ({ row }) => OWNER_LABELS[row.original.owner] },
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
        {hidePayroll ? null : (
          <span className="rounded-md bg-muted px-2 py-1">
            Payroll runs: {report.payrollCount} (finalized{" "}
            {report.payrollFinalizedTotal.toFixed(2)})
          </span>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="font-heading text-lg">Invoices</h3>
        <DataTable
          columns={invoiceColumns}
          data={report.invoiceRows}
          emptyMessage="No invoices in this period."
        />
      </div>
      {hidePayroll ? null : (
        <div className="space-y-2">
          <h3 className="font-heading text-lg">Payroll</h3>
          <DataTable
            columns={payrollColumns}
            data={report.payrollRows}
            emptyMessage="No payroll runs in this period."
          />
        </div>
      )}
    </div>
  );
}

function ownerSplitConfig(
  report: OpsReport,
  includeFuelAmounts: boolean
): { metrics: OwnerSplitMetric[]; countLabel: string } | null {
  switch (report.type) {
    case "trips":
      return { metrics: ["count"], countLabel: "Trips" };
    case "fuel":
      return { metrics: includeFuelAmounts ? ["count", "litres", "amount"] : ["count", "litres"], countLabel: "Fill-ups" };
    case "commercial":
      return { metrics: ["count", "amount", "issued", "paid"], countLabel: "Invoices" };
    default:
      return null;
  }
}

function ReportResults({
  report,
  hidePayroll = false,
  includeFuelAmounts = false,
  owner = "all",
}: {
  report: OpsReport;
  hidePayroll?: boolean;
  includeFuelAmounts?: boolean;
  owner?: OwnerFilter;
}) {
  // Split by owner is the default for All; the switch shows combined totals.
  const [combined, setCombined] = useState(false);
  const config = ownerSplitConfig(report, includeFuelAmounts);
  const split = "ownerSplit" in report ? report.ownerSplit : null;
  return (
    <div className="space-y-4">
      {owner === "all" && config && split ? (
        <OwnerSplitPanel
          split={split}
          metrics={config.metrics}
          countLabel={config.countLabel}
          combined={combined}
          onCombinedChange={setCombined}
        />
      ) : null}
      <ReportBody report={report} hidePayroll={hidePayroll} includeFuelAmounts={includeFuelAmounts} />
    </div>
  );
}

function ReportBody({
  report,
  hidePayroll = false,
  includeFuelAmounts = false,
}: {
  report: OpsReport;
  hidePayroll?: boolean;
  includeFuelAmounts?: boolean;
}) {
  switch (report.type) {
    case "trips":
      return <TripsResults report={report} />;
    case "fuel":
      return <FuelResults report={report} showAmounts={includeFuelAmounts} />;
    case "attendance":
      return <AttendanceResults report={report} />;
    case "commercial":
      return <CommercialResults report={report} hidePayroll={hidePayroll} />;
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
  allowedKinds,
  hidePayroll: hidePayrollProp = false,
}: {
  title?: string;
  description?: string;
  showMasterCounts?: boolean;
  allowedKinds?: readonly ReportType[];
  hidePayroll?: boolean;
} = {}) {
  const { can } = useOrg();
  const { kinds: reportKinds, hidePayroll } = visibleReportKinds(
    allowedKinds ?? REPORT_TYPES,
    can,
    hidePayrollProp
  );
  const organisationId = useActiveOrgId();
  const canView = can("reports:view");
  const canViewFuelCost = can("invoices:view") && can("rate_cards:view");
  const weekStart = mondayOfWeek();

  const [applied, setApplied] = useState<{
    report_type: ReportType;
    period_start: string;
    period_end: string;
    owner: OwnerFilter;
  } | null>({
    report_type: "trips",
    period_start: weekStart,
    period_end: weekPeriodEnd(weekStart),
    owner: "all",
  });

  const form = useForm<ReportFilterValues>({
    resolver: zodResolver(reportFilterSchema),
    defaultValues: {
      report_type: "trips",
      period_start: weekStart,
      period_end: weekPeriodEnd(weekStart),
      owner: "all",
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
          ).concat(canViewFuelCost ? ["fuel-amounts"] : [], [`owner:${applied.owner}`])
        : ["ops-report", "none"],
    queryFn: () =>
      buildOpsReport(
        organisationId!,
        applied!.report_type,
        {
          periodStart: applied!.period_start,
          periodEnd: applied!.period_end,
        },
        { includeFuelAmounts: canViewFuelCost, owner: applied!.owner }
      ),
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
                  reportQuery.data!,
                  { includeFuelAmounts: canViewFuelCost }
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
        className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={form.handleSubmit((values) => {
          setApplied({
            report_type: values.report_type,
            period_start: values.period_start,
            period_end: values.period_end,
            owner: values.owner ?? "all",
          });
        })}
      >
        <SelectField
          control={form.control}
          name="report_type"
          id="report-type"
          label="Report"
          options={reportKinds.map((t) => ({
            value: t,
            label:
              hidePayroll && t === "commercial"
                ? "Invoices"
                : REPORT_TYPE_LABELS[t],
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
        <SelectField
          control={form.control}
          name="owner"
          label="Owner"
          options={OWNER_FILTERS.map((o) => ({ value: o, label: OWNER_FILTER_LABELS[o] }))}
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
        <ReportResults
          key={`${applied?.report_type}:${applied?.owner}`}
          report={reportQuery.data}
          hidePayroll={hidePayroll}
          includeFuelAmounts={canViewFuelCost}
          owner={applied?.owner ?? "all"}
        />
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
