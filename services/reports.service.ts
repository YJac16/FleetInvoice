import {
  EMPTY_OWNER_LOOKUP,
  filterRowsByOwner,
  resolveFleetOwner,
  splitByOwner,
  toBucket,
  type OwnerLookup,
  type OwnerSplitRow,
} from "@/features/reports/lib/owner-split";
import { isDateInPeriod, isInstantInPeriod } from "@/features/reports/lib/period";
import { actorName, toActorNameMap, type ActorNameMap } from "@/features/trips/lib/actor-labels";
import { OWNER_LABELS, resolveInvoiceOwner, type OwnerBucket, type OwnerFilter } from "@/lib/owner-tag";
import { listOrgActorNames } from "@/services/actor-names.service";
import { listDrivers } from "@/services/drivers.service";
import { listVehicles } from "@/services/vehicles.service";
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
  ownerSplit: OwnerSplitRow[];
  rows: Array<{
    id: string;
    planned_start: string;
    status: TripStatus;
    route: string;
    owner: OwnerBucket;
    entered_by: string;
    updated_by: string;
  }>;
};

export type FuelReport = {
  type: "fuel";
  totalLitres: number;
  totalAmount: number;
  ownerSplit: OwnerSplitRow[];
  rows: Array<{
    owner: OwnerBucket;
    id: string;
    filled_at: string;
    vehicle: string;
    company: string;
    driver: string;
    odometer_km: number;
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
  ownerSplit: OwnerSplitRow[];
  invoiceRows: Array<{
    owner: OwnerBucket;
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

/** Driver / vehicle owner tags. Best effort: a failed lookup leaves rows unassigned. */
async function loadOwnerLookup(organisationId: string): Promise<OwnerLookup> {
  try {
    const [drivers, vehicles] = await Promise.all([
      listDrivers(organisationId),
      listVehicles(organisationId),
    ]);
    return {
      drivers: new Map((drivers ?? []).map((d) => [d.id, d.owner_tag ?? null])),
      vehicles: new Map((vehicles ?? []).map((v) => [v.id, v.owner_tag ?? null])),
    };
  } catch {
    return EMPTY_OWNER_LOOKUP;
  }
}

async function loadActorNames(organisationId: string): Promise<ActorNameMap> {
  try {
    return toActorNameMap(await listOrgActorNames(organisationId));
  } catch {
    return new Map();
  }
}

export type BuildOpsReportOptions = {
  includeFuelAmounts?: boolean;
  /** All (default) / Yaseen / Fadia. Totals always describe the filtered rows. */
  owner?: OwnerFilter;
  /** Pre-loaded lookups (tests, or callers that already hold them). */
  ownerLookup?: OwnerLookup;
  actorNames?: ActorNameMap;
};

export async function buildOpsReport(
  organisationId: string,
  reportType: ReportType,
  period: ReportPeriod,
  options?: BuildOpsReportOptions
): Promise<OpsReport> {
  const includeFuelAmounts = options?.includeFuelAmounts ?? false;
  const ownerFilter: OwnerFilter = options?.owner ?? "all";
  const lookupFor = async () => options?.ownerLookup ?? (await loadOwnerLookup(organisationId));
  switch (reportType) {
    case "trips": {
      const [trips, lookup, names] = await Promise.all([
        listTrips(organisationId),
        lookupFor(),
        options?.actorNames ? Promise.resolve(options.actorNames) : loadActorNames(organisationId),
      ]);
      const inPeriod = trips.filter((t) => tripInPeriod(t, period));
      const rows = filterRowsByOwner(
        inPeriod.map((t) => {
          const active = t.trip_assignments?.find((a) => !a.released_at) ?? t.trip_assignments?.[0];
          return {
            id: t.id,
            planned_start: t.planned_start,
            status: t.status,
            route: t.routes?.name ?? "",
            owner: toBucket(resolveFleetOwner(lookup, active?.driver_id, active?.vehicle_id)),
            entered_by: actorName(names, t.created_by) ?? "",
            updated_by: actorName(names, t.updated_by) ?? "",
          };
        }),
        ownerFilter
      );
      const statusCounts: Record<string, number> = {};
      for (const t of rows) {
        statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
      }
      return {
        type: "trips",
        statusCounts,
        ownerSplit: splitByOwner(rows),
        rows,
      };
    }
    case "fuel": {
      const [fillups, lookup] = await Promise.all([
        listFuelFillups(organisationId, {
          includeAmounts: includeFuelAmounts,
        }),
        lookupFor(),
      ]);
      const inPeriod = fillups.filter(
        (f) =>
          isInstantInPeriod(f.filled_at, period.periodStart, period.periodEnd) &&
          (ownerFilter === "all" ||
            resolveFleetOwner(lookup, f.driver_id, f.vehicle_id) === ownerFilter)
      );
      let totalLitres = 0;
      let totalAmount = 0;
      const rows = inPeriod.map((f: FuelFillup) => {
        totalLitres += Number(f.litres) || 0;
        if (includeFuelAmounts) totalAmount += Number(f.total_amount) || 0;
        return {
          owner: toBucket(resolveFleetOwner(lookup, f.driver_id, f.vehicle_id)),
          id: f.id,
          filled_at: f.filled_at,
          vehicle:
            f.vehicles?.name ??
            f.vehicles?.registration_number ??
            f.vehicle_id.slice(0, 8),
          company: f.companies?.name ?? "",
          driver: f.drivers?.full_name ?? "",
          odometer_km: Number(f.odometer_km) || 0,
          litres: Number(f.litres) || 0,
          total_amount: includeFuelAmounts ? f.total_amount : null,
          currency: includeFuelAmounts ? (f.currency ?? "") : "",
        };
      });
      return {
        type: "fuel",
        totalLitres,
        totalAmount,
        ownerSplit: splitByOwner(
          rows.map((r) => ({
            owner: r.owner,
            litres: r.litres,
            amount: includeFuelAmounts ? Number(r.total_amount) || 0 : 0,
          }))
        ),
        rows,
      };
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
          isDateInPeriod(i.period_start, period.periodStart, period.periodEnd) &&
          (ownerFilter === "all" || resolveInvoiceOwner(i) === ownerFilter)
      );
      // Payroll runs have no owner: only part of the combined (All) view.
      const payrollInPeriod = payrollRuns.filter(
        (r) =>
          ownerFilter === "all" &&
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
        ownerSplit: splitByOwner(
          invoiceInPeriod.map((i) => ({
            owner: toBucket(resolveInvoiceOwner(i)),
            amount: Number(i.total) || 0,
            issued: i.status === "issued" ? Number(i.total) || 0 : 0,
            paid: i.status === "paid" ? Number(i.total) || 0 : 0,
          }))
        ),
        invoiceRows: invoiceInPeriod.map((i) => ({
          owner: toBucket(resolveInvoiceOwner(i)),
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
  report: OpsReport,
  options?: { includeFuelAmounts?: boolean }
): { headers: string[]; rows: Record<string, unknown>[]; filename: string } {
  switch (report.type) {
    case "trips":
      return {
        filename: "trips-report.csv",
        headers: ["id", "planned_start", "status", "route", "owner", "entered_by", "updated_by"],
        rows: report.rows.map((r) => ({ ...r, owner: OWNER_LABELS[r.owner] })),
      };
    case "fuel": {
      const opsHeaders = [
        "id",
        "filled_at",
        "vehicle",
        "company",
        "driver",
        "odometer_km",
        "litres",
        "owner",
      ];
      const labelled = report.rows.map((r) => ({ ...r, owner: OWNER_LABELS[r.owner] }));
      if (options?.includeFuelAmounts) {
        return {
          filename: "fuel-report.csv",
          headers: [...opsHeaders, "total_amount", "currency"],
          rows: labelled,
        };
      }
      return {
        filename: "fuel-report.csv",
        headers: opsHeaders,
        rows: labelled.map(
          ({ total_amount: _a, currency: _c, ...ops }) => ops
        ),
      };
    }
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
          "owner",
        ],
        rows: [
          ...report.invoiceRows.map((r) => ({ kind: "invoice", ...r, owner: OWNER_LABELS[r.owner] })),
          ...report.payrollRows.map((r) => ({
            kind: "payroll",
            company: "",
            owner: OWNER_LABELS.unassigned,
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
