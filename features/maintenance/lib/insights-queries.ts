import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { addMonths, computeDue, type Reading } from "@/features/maintenance/lib/forecast";
import { buildLastPaidIndex, type LastPaidIndex, type PaidLine } from "@/features/maintenance/lib/last-paid";
import {
  contribution,
  tripVehicleId,
  verdictFor,
  type OwnerFilter,
  type Verdict,
} from "@/features/maintenance/lib/worth-keeping";
import { formatVehicleLabel } from "@/features/vehicles/lib/vehicle-label";
import { createClient } from "@/lib/supabase/server";

const PAGE = 1000;
const num = (v: unknown): number => Number(v ?? 0);

type Embedded<T> = T | T[] | null;
function one<T>(value: Embedded<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/** Read every page of a query (PostgREST caps one response). */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

type FinalLineRow = {
  category_id: string | null;
  quantity: unknown;
  line_excl: unknown;
  line_incl: unknown;
  bill: Embedded<{
    bill_date: string;
    vehicle_id: string | null;
    odometer_km: number | null;
    status: string;
    deleted_at: string | null;
    supplier: Embedded<{ name: string }>;
  }>;
};

/** Lines of Final, non-deleted bills that have a category. */
async function listFinalLines(supabase: SupabaseClient, organisationId: string) {
  const rows = await fetchAll<FinalLineRow>((from, to) =>
    supabase
      .from("workshop_bill_lines")
      .select(
        "category_id, quantity, line_excl, line_incl, bill:workshop_bills!inner(bill_date, vehicle_id, odometer_km, status, deleted_at, supplier:suppliers(name))"
      )
      .eq("organisation_id", organisationId)
      .not("category_id", "is", null)
      .eq("bill.status", "approved")
      .is("bill.deleted_at", null)
      .order("id", { ascending: true })
      .range(from, to)
  );
  return rows.flatMap((r) => {
    const bill = one(r.bill);
    if (!bill) return [];
    return [
      {
        category_id: r.category_id,
        vehicle_id: bill.vehicle_id,
        bill_date: bill.bill_date,
        odometer_km: bill.odometer_km == null ? null : Number(bill.odometer_km),
        supplier_name: one(bill.supplier)?.name ?? "—",
        quantity: num(r.quantity),
        line_excl: num(r.line_excl),
        line_incl: num(r.line_incl),
      },
    ];
  });
}

/** Bill form: last paid per category (signed-in user's client, RLS applies). */
export async function getLastPaidIndex(organisationId: string): Promise<LastPaidIndex> {
  const supabase = await createClient();
  const lines = await listFinalLines(supabase, organisationId);
  const paid: PaidLine[] = lines.map(({ odometer_km: _o, ...rest }) => {
    void _o;
    return rest;
  });
  return buildLastPaidIndex(paid);
}

// ---------------------------------------------------------------------------
// Due

export type IntervalRow = {
  category_id: string;
  category_name: string;
  interval_km: number | null;
  interval_months: number | null;
};

export type DueRow = {
  key: string;
  vehicle_id: string;
  vehicle_label: string;
  category_name: string;
  last_bill_date: string;
  dueKm: number | null;
  dueDate: string | null;
  dateBasis: "months" | "km" | null;
  overdue: boolean;
  hasEstimate: boolean;
  /** Last paid incl. VAT. null for managers (no rand) or when unknown. */
  cost: number | null;
};

export async function listIntervals(organisationId: string): Promise<IntervalRow[]> {
  const supabase = await createClient();
  const [cats, ints] = await Promise.all([
    supabase
      .from("maintenance_categories")
      .select("id, name")
      .eq("organisation_id", organisationId)
      .eq("active", true)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("maintenance_intervals")
      .select("category_id, interval_km, interval_months")
      .eq("organisation_id", organisationId),
  ]);
  if (cats.error) throw new Error(cats.error.message);
  if (ints.error) throw new Error(ints.error.message);
  const byCat = new Map(
    (ints.data ?? []).map((i) => [i.category_id as string, i as { interval_km: number | null; interval_months: number | null }])
  );
  return ((cats.data ?? []) as Array<{ id: string; name: string }>).map((c) => ({
    category_id: c.id,
    category_name: c.name,
    interval_km: byCat.get(c.id)?.interval_km ?? null,
    interval_months: byCat.get(c.id)?.interval_months ?? null,
  }));
}

export async function listDue(
  organisationId: string,
  opts: { today: string; includeCost: boolean }
): Promise<DueRow[]> {
  const supabase = await createClient();
  const intervals = (await listIntervals(organisationId)).filter(
    (i) => i.interval_km != null || i.interval_months != null
  );
  if (intervals.length === 0) return [];

  const [lines, vehicles, fills] = await Promise.all([
    listFinalLines(supabase, organisationId),
    supabase
      .from("vehicles")
      .select("id, name, registration_number")
      .eq("organisation_id", organisationId)
      .is("deleted_at", null),
    fetchAll<{ vehicle_id: string; filled_at: string; odometer_km: unknown }>((from, to) =>
      supabase
        .from("fuel_fillups")
        .select("vehicle_id, filled_at, odometer_km")
        .eq("organisation_id", organisationId)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);
  if (vehicles.error) throw new Error(vehicles.error.message);

  // Odometer readings per vehicle: Final bills + fuel fill-ups.
  const readings = new Map<string, Reading[]>();
  const push = (vehicleId: string, date: string, km: number) => {
    const list = readings.get(vehicleId);
    if (list) list.push({ date, km });
    else readings.set(vehicleId, [{ date, km }]);
  };
  const seenBills = new Set<string>();
  for (const l of lines) {
    if (!l.vehicle_id || l.odometer_km == null) continue;
    const k = `${l.vehicle_id}|${l.bill_date}|${l.odometer_km}`;
    if (seenBills.has(k)) continue;
    seenBills.add(k);
    push(l.vehicle_id, l.bill_date, l.odometer_km);
  }
  for (const f of fills) push(f.vehicle_id, f.filled_at.slice(0, 10), num(f.odometer_km));

  const labels = new Map(
    ((vehicles.data ?? []) as Array<{ id: string; name: string | null; registration_number: string | null }>).map(
      (v) => [v.id, formatVehicleLabel(v)]
    )
  );

  const rows: DueRow[] = [];
  for (const interval of intervals) {
    // Last Final bill per vehicle for this category.
    const best = new Map<string, (typeof lines)[number]>();
    for (const l of lines) {
      if (l.category_id !== interval.category_id || !l.vehicle_id || !labels.has(l.vehicle_id)) continue;
      const cur = best.get(l.vehicle_id);
      if (!cur || l.bill_date > cur.bill_date) best.set(l.vehicle_id, l);
    }
    for (const [vehicleId, last] of best) {
      const vr = readings.get(vehicleId) ?? [];
      const currentKm = vr.length ? Math.max(...vr.map((r) => r.km)) : null;
      const due = computeDue({
        today: opts.today,
        intervalKm: interval.interval_km,
        intervalMonths: interval.interval_months,
        lastBillDate: last.bill_date,
        lastOdometerKm: last.odometer_km,
        currentKm,
        readings: vr,
      });
      rows.push({
        key: `${vehicleId}|${interval.category_id}`,
        vehicle_id: vehicleId,
        vehicle_label: labels.get(vehicleId) ?? "Vehicle",
        category_name: interval.category_name,
        last_bill_date: last.bill_date,
        ...due,
        cost: opts.includeCost ? last.line_incl : null,
      });
    }
  }
  // Overdue first, then soonest date, then rows with no date.
  return rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.vehicle_label.localeCompare(b.vehicle_label);
  });
}

// ---------------------------------------------------------------------------
// Worth keeping (admin only: pass the service client after the role guard)

export type WorthKeepingRow = {
  vehicle_id: string;
  vehicle_label: string;
  owner_tag: string | null;
  revenue: number;
  bills: number;
  fuel: number;
  contribution: number;
  verdict: Verdict;
};

export async function listWorthKeeping(
  admin: SupabaseClient,
  organisationId: string,
  opts: { today: string; months: number; owner: OwnerFilter }
): Promise<WorthKeepingRow[]> {
  const from = addMonths(opts.today, -opts.months);
  const fromTs = `${from}T00:00:00Z`;

  let vq = admin
    .from("vehicles")
    .select("id, name, registration_number, owner_tag")
    .eq("organisation_id", organisationId)
    .is("deleted_at", null);
  if (opts.owner !== "all") vq = vq.eq("owner_tag", opts.owner);
  const vehiclesRes = await vq;
  if (vehiclesRes.error) throw new Error(vehiclesRes.error.message);
  const vehicles = (vehiclesRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    registration_number: string | null;
    owner_tag: string | null;
  }>;

  const [lineRows, billRows, fuelRows] = await Promise.all([
    fetchAll<{
      amount: unknown;
      trip: Embedded<{
        planned_start: string;
        deleted_at: string | null;
        trip_assignments: Array<{ vehicle_id: string | null; released_at: string | null; deleted_at: string | null }> | null;
      }>;
      invoice: Embedded<{ status: string; deleted_at: string | null }>;
    }>((a, b) =>
      admin
        .from("invoice_lines")
        .select(
          "amount, trip:trips!invoice_lines_trip_id_fkey!inner(planned_start, deleted_at, trip_assignments(vehicle_id, released_at, deleted_at)), invoice:invoices!inner(status, deleted_at)"
        )
        .eq("organisation_id", organisationId)
        .not("trip_id", "is", null)
        .neq("invoice.status", "void")
        .is("invoice.deleted_at", null)
        .gte("trip.planned_start", fromTs)
        .order("id", { ascending: true })
        .range(a, b)
    ),
    fetchAll<{ vehicle_id: string | null; total_incl: unknown }>((a, b) =>
      admin
        .from("workshop_bills")
        .select("vehicle_id, total_incl")
        .eq("organisation_id", organisationId)
        .eq("status", "approved")
        .is("deleted_at", null)
        .not("vehicle_id", "is", null)
        .gte("bill_date", from)
        .lte("bill_date", opts.today)
        .order("id", { ascending: true })
        .range(a, b)
    ),
    fetchAll<{ vehicle_id: string; total_amount: unknown }>((a, b) =>
      admin
        .from("fuel_fillups")
        .select("vehicle_id, total_amount")
        .eq("organisation_id", organisationId)
        .is("deleted_at", null)
        .not("total_amount", "is", null)
        .gte("filled_at", fromTs)
        .order("id", { ascending: true })
        .range(a, b)
    ),
  ]);

  const revenue = new Map<string, number>();
  for (const r of lineRows) {
    const trip = one(r.trip);
    const invoice = one(r.invoice);
    if (!trip || trip.deleted_at || !invoice || invoice.status === "void" || invoice.deleted_at) continue;
    // trips has no vehicle_id: the vehicle is on the trip's active assignment.
    const vehicleId = tripVehicleId(trip.trip_assignments);
    if (!vehicleId) continue;
    revenue.set(vehicleId, (revenue.get(vehicleId) ?? 0) + num(r.amount));
  }
  const bills = new Map<string, number>();
  for (const b of billRows) {
    if (b.vehicle_id) bills.set(b.vehicle_id, (bills.get(b.vehicle_id) ?? 0) + num(b.total_incl));
  }
  const fuel = new Map<string, number>();
  for (const f of fuelRows) {
    fuel.set(f.vehicle_id, (fuel.get(f.vehicle_id) ?? 0) + num(f.total_amount));
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rows = vehicles.map((v): WorthKeepingRow => {
    const totals = {
      revenue: r2(revenue.get(v.id) ?? 0),
      bills: r2(bills.get(v.id) ?? 0),
      fuel: r2(fuel.get(v.id) ?? 0),
    };
    return {
      vehicle_id: v.id,
      vehicle_label: formatVehicleLabel(v),
      owner_tag: v.owner_tag,
      ...totals,
      contribution: contribution(totals),
      verdict: verdictFor(totals),
    };
  });
  const rank: Record<Verdict, number> = { review: 0, keep: 1, no_activity: 2 };
  return rows.sort(
    (a, b) => rank[a.verdict] - rank[b.verdict] || a.contribution - b.contribution || a.vehicle_label.localeCompare(b.vehicle_label)
  );
}
