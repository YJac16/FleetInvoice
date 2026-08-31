import { createClient } from "@/lib/supabase/client";
import {
  parseTripLogNotes,
  resolveTripServiceCompany,
  resolveVehicleRegistration,
} from "@/features/invoices/lib/trip-notes";
import { weekPeriodEnd } from "@/features/invoices/lib/week";
import {
  listTenantRows,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { Invoice, InvoiceLine, InvoicePrintTripLine } from "@/types";

export {
  addDaysYmd,
  defaultServiceWeekMonday,
  invoiceDateFromWeekStart,
  mondayOfWeek,
  mondayOfWeekYmd,
  recentServiceWeekMondays,
  serviceWeekSunday,
  weekPeriodEnd,
  isFilledAtInWeek,
  ymdInSast,
} from "@/features/invoices/lib/week";

const TABLE = "invoices";

const INVOICE_SELECT =
  "*, companies:company_id (id, name, address, contact_phone), drivers:driver_id (id, full_name)";

export function listInvoices(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<Invoice>(TABLE, organisationId, {
    orderBy: "period_start",
    select: INVOICE_SELECT,
    ...options,
  });
}

export async function getInvoice(
  organisationId: string,
  invoiceId: string
): Promise<Invoice | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(INVOICE_SELECT)
    .eq("organisation_id", organisationId)
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as Invoice | null;
}

export async function listInvoiceLines(
  organisationId: string,
  invoiceId: string
): Promise<InvoiceLine[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoice_lines")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InvoiceLine[];
}

type TripPrintRow = {
  id: string;
  planned_start: string;
  notes: string | null;
  routes: {
    name: string | null;
  } | null;
  trip_assignments: Array<{
    driver_id: string;
    released_at: string | null;
    deleted_at: string | null;
    vehicles: {
      name: string | null;
      registration_number: string | null;
    } | null;
  }> | null;
};

/** Trip invoice lines for print — route.name = company, notes = pax/area, vehicle reg. */
export async function listInvoicePrintTripLines(
  organisationId: string,
  invoiceId: string,
  driverId: string | null
): Promise<InvoicePrintTripLine[]> {
  const lines = await listInvoiceLines(organisationId, invoiceId);
  const tripLines = lines.filter((l) => l.line_type === "trip" && l.trip_id);
  if (!tripLines.length) return [];

  const tripIds = tripLines.map((l) => l.trip_id!);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, planned_start, notes, routes:route_id (name), trip_assignments (driver_id, released_at, deleted_at, vehicles:vehicle_id (name, registration_number))"
    )
    .eq("organisation_id", organisationId)
    .in("id", tripIds);
  if (error) throw error;

  const trips = (data ?? []) as TripPrintRow[];
  const tripById = new Map(trips.map((t) => [t.id, t]));
  const amountByTripId = new Map(tripLines.map((l) => [l.trip_id!, l.amount]));

  const enriched: InvoicePrintTripLine[] = [];
  for (const line of tripLines) {
    const trip = tripById.get(line.trip_id!);
    if (!trip) continue;

    const parsed = parseTripLogNotes(trip.notes);
    const assignments = (trip.trip_assignments ?? []).filter(
      (a) =>
        !a.deleted_at &&
        !a.released_at &&
        (!driverId || a.driver_id === driverId)
    );
    const assignment = assignments[0];

    enriched.push({
      id: line.id,
      planned_start: trip.planned_start,
      company_name: resolveTripServiceCompany(trip.routes?.name, trip.notes),
      area_name: parsed.area,
      pax_count: parsed.pax,
      registration_number: resolveVehicleRegistration(
        assignment?.vehicles?.registration_number,
        assignment?.vehicles?.name
      ),
      amount: amountByTripId.get(trip.id) ?? line.amount,
    });
  }

  enriched.sort(
    (a, b) =>
      new Date(a.planned_start).getTime() - new Date(b.planned_start).getTime()
  );
  return enriched;
}

export async function generateWeeklyFuelInvoice(
  organisationId: string,
  companyId: string,
  weekStart: string
): Promise<Invoice> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("generate_weekly_fuel_invoice", {
    p_organisation_id: organisationId,
    p_company_id: companyId,
    p_week_start: weekStart,
  });
  if (error) throw error;
  return data as Invoice;
}

export async function generatePeriodInvoice(
  organisationId: string,
  companyId: string,
  periodStart: string,
  periodEnd: string
): Promise<Invoice> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("generate_period_invoice", {
    p_organisation_id: organisationId,
    p_company_id: companyId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
  if (error) throw error;
  return data as Invoice;
}

export async function generateDriverWeeklyInvoice(
  organisationId: string,
  driverId: string,
  weekStart: string
): Promise<Invoice> {
  const periodEnd = weekPeriodEnd(weekStart);
  const supabase = createClient();
  const { data, error } = await supabase.rpc("generate_driver_weekly_invoice", {
    p_organisation_id: organisationId,
    p_driver_id: driverId,
    p_period_start: weekStart,
    p_period_end: periodEnd,
  });
  if (error) throw error;
  return data as Invoice;
}

export async function setInvoiceStatus(
  invoiceId: string,
  status: Invoice["status"]
): Promise<Invoice> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("set_invoice_status", {
    p_invoice_id: invoiceId,
    p_status: status,
  });
  if (error) throw error;
  return data as Invoice;
}
