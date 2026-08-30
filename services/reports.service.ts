import { isDateInPeriod, isInstantInPeriod } from "@/features/reports/lib/period";
import type { ReportType } from "@/features/reports/schemas/report";
import type { TripStatus } from "@/lib/constants";
import { listAttendanceEvents } from "@/services/attendance.service";
import { listFuelFillups } from "@/services/fuel-fillups.service";
import { listInvoices } from "@/services/invoices.service";
import { listPayrollRuns } from "@/services/payroll.service";
import { listTrips } from "@/services/trips.service";
import type {
  AttendanceEvent,
  FuelFillup,
  Invoice,
  PayrollRun,
  Trip,
} from "@/types";

export type ReportPeriod = {
  periodStart: string;
  periodEnd: string;
};

export type TripsReport = {
  type: "trips";
  statusCounts: Record<string, number>;
  rows: Array<{
    id: string;
    planned_start: string;
    status: TripStatus;
    route: string;
  }>;
};

export type FuelReport = {
  type: "fuel";
  totalLitres: number;
  totalAmount: number;
  rows: Array<{
    id: string;
    filled_at: string;
    vehicle: string;
    company: string;
    litres: number;
    total_amount: number | null;
    currency: string;
  }>;
};

export type AttendanceReport = {
  type: "attendance";
  boardingCount: number;
  rows: Array<{
    id: string;
    created_at: string;
    employee: string;
    trip: string;
    event_type: string;
  }>;
};

export type CommercialReport = {
  type: "commercial";
  invoiceIssuedTotal: number;
  invoicePaidTotal: number;
  invoiceCount: number;
  payrollFinalizedTotal: number;
  payrollCount: number;
  invoiceRows: Array<{
    id: string;
    period_start: string;
    period_end: string;
    status: string;
    company: string;
    total: number;
    currency: string;
  }>;
  payrollRows: Array<{
    id: string;
    period_start: string;
    period_end: string;
    status: string;
    total: number;
    currency: string;
  }>;
};

export type OpsReport =
  | TripsReport
  | FuelReport
  | AttendanceReport
  | CommercialReport;

function tripInPeriod(trip: Trip, period: ReportPeriod): boolean {
  return isInstantInPeriod(
    trip.planned_start,
    period.periodStart,
    period.periodEnd
  );
}

export async function buildOpsReport(
  organisationId: string,
  reportType: ReportType,
  period: ReportPeriod
): Promise<OpsReport> {
  switch (reportType) {
    case "trips": {
      const trips = await listTrips(organisationId);
      const inPeriod = trips.filter((t) => tripInPeriod(t, period));
      const statusCounts: Record<string, number> = {};
      for (const t of inPeriod) {
        statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
      }
      return {
        type: "trips",
        statusCounts,
        rows: inPeriod.map((t) => ({
          id: t.id,
          planned_start: t.planned_start,
          status: t.status,
          route: t.routes?.name ?? "",
        })),
      };
    }
    case "fuel": {
      const fillups = await listFuelFillups(organisationId);
      const inPeriod = fillups.filter((f) =>
        isInstantInPeriod(f.filled_at, period.periodStart, period.periodEnd)
      );
      let totalLitres = 0;
      let totalAmount = 0;
      const rows = inPeriod.map((f: FuelFillup) => {
        totalLitres += Number(f.litres) || 0;
        totalAmount += Number(f.total_amount) || 0;
        return {
          id: f.id,
          filled_at: f.filled_at,
          vehicle:
            f.vehicles?.name ??
            f.vehicles?.registration_number ??
            f.vehicle_id.slice(0, 8),
          company: f.companies?.name ?? "",
          litres: Number(f.litres) || 0,
          total_amount: f.total_amount,
          currency: f.currency,
        };
      });
      return { type: "fuel", totalLitres, totalAmount, rows };
    }
    case "attendance": {
      const events = await listAttendanceEvents(organisationId);
      const inPeriod = events.filter(
        (e: AttendanceEvent) =>
          e.event_type === "boarded" &&
          isInstantInPeriod(e.created_at, period.periodStart, period.periodEnd)
      );
      return {
        type: "attendance",
        boardingCount: inPeriod.length,
        rows: inPeriod.map((e) => ({
          id: e.id,
          created_at: e.created_at,
          employee: e.employees?.full_name ?? e.employee_id.slice(0, 8),
          trip: e.trips?.routes?.name
            ? `${e.trips.routes.name} @ ${e.trips.planned_start}`
            : e.trip_id.slice(0, 8),
          event_type: e.event_type,
        })),
      };
    }
    case "commercial": {
      const [invoices, payrollRuns] = await Promise.all([
        listInvoices(organisationId),
        listPayrollRuns(organisationId).catch(() => [] as PayrollRun[]),
      ]);
      const invoiceInPeriod = invoices.filter(
        (i: Invoice) =>
          i.status !== "void" &&
          isDateInPeriod(i.period_start, period.periodStart, period.periodEnd)
      );
      const payrollInPeriod = payrollRuns.filter(
        (r) =>
          r.status !== "void" &&
          isDateInPeriod(r.period_start, period.periodStart, period.periodEnd)
      );

      let invoiceIssuedTotal = 0;
      let invoicePaidTotal = 0;
      for (const i of invoiceInPeriod) {
        if (i.status === "issued") invoiceIssuedTotal += Number(i.total) || 0;
        if (i.status === "paid") invoicePaidTotal += Number(i.total) || 0;
      }

      let payrollFinalizedTotal = 0;
      for (const r of payrollInPeriod) {
        if (r.status === "finalized") {
          payrollFinalizedTotal += Number(r.total) || 0;
        }
      }

      return {
        type: "commercial",
        invoiceIssuedTotal,
        invoicePaidTotal,
        invoiceCount: invoiceInPeriod.length,
        payrollFinalizedTotal,
        payrollCount: payrollInPeriod.length,
        invoiceRows: invoiceInPeriod.map((i) => ({
          id: i.id,
          period_start: i.period_start,
          period_end: i.period_end,
          status: i.status,
          company: i.companies?.name ?? i.company_id.slice(0, 8),
          total: Number(i.total) || 0,
          currency: i.currency,
        })),
        payrollRows: payrollInPeriod.map((r) => ({
          id: r.id,
          period_start: r.period_start,
          period_end: r.period_end,
          status: r.status,
          total: Number(r.total) || 0,
          currency: r.currency,
        })),
      };
    }
    default: {
      const _exhaustive: never = reportType;
      throw new Error(`Unknown report type: ${_exhaustive}`);
    }
  }
}

export function reportToCsvRows(
  report: OpsReport
): { headers: string[]; rows: Record<string, unknown>[]; filename: string } {
  switch (report.type) {
    case "trips":
      return {
        filename: "trips-report.csv",
        headers: ["id", "planned_start", "status", "route"],
        rows: report.rows,
      };
    case "fuel":
      return {
        filename: "fuel-report.csv",
        headers: [
          "id",
          "filled_at",
          "vehicle",
          "company",
          "litres",
          "total_amount",
          "currency",
        ],
        rows: report.rows,
      };
    case "attendance":
      return {
        filename: "attendance-report.csv",
        headers: ["id", "created_at", "employee", "trip", "event_type"],
        rows: report.rows,
      };
    case "commercial":
      return {
        filename: "commercial-report.csv",
        headers: [
          "kind",
          "id",
          "period_start",
          "period_end",
          "status",
          "company",
          "total",
          "currency",
        ],
        rows: [
          ...report.invoiceRows.map((r) => ({ kind: "invoice", ...r })),
          ...report.payrollRows.map((r) => ({
            kind: "payroll",
            company: "",
            ...r,
          })),
        ],
      };
    default: {
      const _exhaustive: never = report;
      throw new Error(`Unknown report: ${_exhaustive}`);
    }
  }
}
