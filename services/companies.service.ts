import { createClient } from "@/lib/supabase/client";
import {
  createTenantRow,
  listTenantRows,
  restoreTenantRow,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import { createRateCard } from "@/services/rate-cards.service";
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

export async function createCompanyTripRateCard(
  organisationId: string,
  companyId: string,
  input: CompanyTripRateInput
): Promise<RateCard> {
  const label = input.name?.trim() || "Default trip rate";
  return createRateCard(organisationId, {
    company_id: companyId,
    name: label,
    line_type: "trip",
    unit: "fixed",
    unit_amount: input.unitAmount,
    effective_from: input.effectiveFrom,
    notes: input.notes ?? null,
  });
}

export type CompanyWritePayload = Omit<
  Partial<Company>,
  "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
> & { name: string };

export async function createCompanyWithOptionalTripRate(
  organisationId: string,
  company: CompanyWritePayload,
  tripRate?: CompanyTripRateInput | null
): Promise<Company> {
  const created = await createCompany(organisationId, company);
  if (tripRate) {
    await createCompanyTripRateCard(organisationId, created.id, tripRate);
  }
  return created;
}

export async function updateCompanyWithOptionalTripRate(
  companyId: string,
  organisationId: string,
  company: Partial<CompanyWritePayload>,
  tripRate?: CompanyTripRateInput | null
): Promise<Company> {
  const updated = await updateCompany(companyId, company);
  if (tripRate) {
    await createCompanyTripRateCard(organisationId, companyId, tripRate);
  }
  return updated;
}
