import { createClient } from "@/lib/supabase/client";

export type ComplianceSubjectKind =
  | "driver_license"
  | "driver_pdp"
  | "vehicle_permit"
  | "vehicle_disc"
  | "vehicle_document";

export type ComplianceRenewalRow = {
  subject_kind: ComplianceSubjectKind;
  subject_id: string;
  organisation_id: string;
  driver_id: string | null;
  vehicle_id: string | null;
  subject_name: string;
  registration_number: string | null;
  document_label: string | null;
  expires_on: string;
  days_remaining: number;
  status: string;
};

export type ComplianceMissingRow = {
  category: string;
  entity_kind: string;
  entity_id: string;
  entity_name: string;
  link_path: string;
};

export async function listComplianceRenewals(
  organisationId: string,
  withinDays: number
): Promise<ComplianceRenewalRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_compliance_renewals", {
    p_organisation_id: organisationId,
    p_within_days: withinDays,
  });
  if (error) throw error;
  return (data ?? []) as ComplianceRenewalRow[];
}

export async function listComplianceMissingData(
  organisationId: string
): Promise<ComplianceMissingRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_compliance_missing_data", {
    p_organisation_id: organisationId,
  });
  if (error) throw error;
  return (data ?? []) as ComplianceMissingRow[];
}

export async function listMyCompliance(
  organisationId: string
): Promise<ComplianceRenewalRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_my_compliance", {
    p_organisation_id: organisationId,
  });
  if (error) throw error;
  return (data ?? []) as ComplianceRenewalRow[];
}
