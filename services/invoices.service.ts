import { createClient } from "@/lib/supabase/client";
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
