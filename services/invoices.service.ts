import { createClient } from "@/lib/supabase/client";
import type {
  InvoiceFuelEmbed,
  InvoiceTripEmbed,
} from "@/features/invoices/lib/invoice-trip-row";
import {
  listTenantRows,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { Invoice, InvoiceLine } from "@/types";

export { mondayOfWeek, weekPeriodEnd, isFilledAtInWeek } from "@/features/invoices/lib/week";

const TABLE = "invoices";

const INVOICE_SELECT = "*, companies:company_id (id, name)";

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

const INVOICE_LINE_TRIP_SELECT = `
  *,
  trips:trip_id (
    id,
    planned_start,
    notes,
    companies:company_id ( name ),
    routes:route_id ( name ),
    trip_passengers ( id, status ),
    trip_assignments (
      drivers:driver_id ( full_name ),
      vehicles:vehicle_id ( name, registration_number )
    )
  ),
  fuel_fillups:fuel_fillup_id (
    id,
    filled_at,
    odometer_km,
    drivers:driver_id ( full_name ),
    vehicles:vehicle_id ( name, registration_number )
  )
`;

export type InvoiceLineWithTrip = InvoiceLine & {
  trips?: InvoiceTripEmbed | null;
  fuel_fillups?: InvoiceFuelEmbed | null;
};

export async function listInvoiceLinesWithTrips(
  organisationId: string,
  invoiceId: string
): Promise<InvoiceLineWithTrip[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoice_lines")
    .select(INVOICE_LINE_TRIP_SELECT)
    .eq("organisation_id", organisationId)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InvoiceLineWithTrip[];
}

export async function listInvoiceLinesWithTripsForInvoices(
  organisationId: string,
  invoiceIds: string[]
): Promise<InvoiceLineWithTrip[]> {
  if (invoiceIds.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoice_lines")
    .select(INVOICE_LINE_TRIP_SELECT)
    .eq("organisation_id", organisationId)
    .in("invoice_id", invoiceIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InvoiceLineWithTrip[];
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
