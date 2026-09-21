import { createClient } from "@/lib/supabase/client";

export type ComplianceRenewalKind =
  | "driver_license"
  | "driver_pdp"
  | "vehicle_document";

export type ComplianceRenewalRow = {
  kind: ComplianceRenewalKind;
  entity_id: string;
  related_id: string;
  entity_name: string;
  detail: string;
  expires_on: string;
  days_remaining: number;
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
