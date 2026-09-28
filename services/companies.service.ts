import { createClient } from "@/lib/supabase/client";
import {
  createTenantRow,
  listTenantRows,
  restoreTenantRow,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { Company, RateCard } from "@/types";

const TABLE = "companies";

export async function getCompany(
  organisationId: string,
  companyId: string
): Promise<Company | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as Company | null;
}

export function listCompanies(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<Company>(TABLE, organisationId, {
    orderBy: "name",
    ...options,
  });
}

export const createCompany = (
  organisationId: string,
  input: Omit<
    Partial<Company>,
    "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
  > & { name: string }
) =>
  createTenantRow<Company>(TABLE, {
    organisation_id: organisationId,
    ...input,
  });

export const updateCompany = (id: string, input: Partial<Company>) =>
  updateTenantRow<Company>(TABLE, id, input);

export const deleteCompany = (id: string) => softDeleteTenantRow(TABLE, id);

export const restoreCompany = (id: string) => restoreTenantRow(TABLE, id);

export async function listActiveCompanies(organisationId: string): Promise<Company[]> {
  const rows = await listCompanies(organisationId);
  return rows.filter((c) => c.status === "active");
}

export async function listCompanyTripRateCards(
  organisationId: string,
  companyId: string
): Promise<RateCard[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("rate_cards")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("company_id", companyId)
    .eq("line_type", "trip")
    .is("deleted_at", null)
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return (data as RateCard[]) ?? [];
}

export type CompanyTripRateInput = {
  unitAmount: number;
  effectiveFrom: string;
  name?: string;
  notes?: string | null;
};

export type CompanyWritePayload = Omit<
  Partial<Company>,
  "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
> & { name: string };

async function upsertCompanyWithOptionalTripRate(
  organisationId: string,
  companyId: string | null,
  company: CompanyWritePayload,
  tripRate?: CompanyTripRateInput | null
): Promise<Company> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("upsert_company_with_trip_rate", {
    p_organisation_id: organisationId,
    p_company_id: companyId,
    p_name: company.name,
    p_code: company.code ?? null,
    p_contact_name: company.contact_name ?? null,
    p_contact_email: company.contact_email ?? null,
    p_contact_phone: company.contact_phone ?? null,
    p_address: company.address ?? null,
    p_status: company.status ?? "active",
    p_trip_rate_amount: tripRate?.unitAmount ?? null,
    p_trip_rate_effective_from: tripRate?.effectiveFrom ?? null,
    p_trip_rate_name: tripRate?.name ?? null,
    p_trip_rate_notes: tripRate?.notes ?? null,
  });
  if (error) throw error;
  return data as Company;
}

export function createCompanyWithOptionalTripRate(
  organisationId: string,
  company: CompanyWritePayload,
  tripRate?: CompanyTripRateInput | null
) {
  return upsertCompanyWithOptionalTripRate(organisationId, null, company, tripRate);
}

export function updateCompanyWithOptionalTripRate(
  companyId: string,
  organisationId: string,
  company: Partial<CompanyWritePayload>,
  tripRate?: CompanyTripRateInput | null
) {
  if (!company.name) {
    throw new Error("Company name is required");
  }
  return upsertCompanyWithOptionalTripRate(
    organisationId,
    companyId,
    company as CompanyWritePayload,
    tripRate
  );
}
