import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Billing checkout / Stripe portal may only be opened for an organisation
 * the caller administers (org admin) or any org when platform owner.
 */
export async function assertBillingManageAccess(
  supabase: SupabaseClient,
  organisationId: string
): Promise<void> {
  const { data: isOwner, error: ownerError } = await supabase.rpc(
    "is_platform_owner"
  );
  if (ownerError) throw ownerError;
  if (isOwner) return;

  const { data: isOrgAdmin, error: roleError } = await supabase.rpc(
    "has_org_role_names",
    {
      org_id: organisationId,
      allowed: ["organisation_admin"],
    }
  );
  if (roleError) throw roleError;
  if (!isOrgAdmin) {
    throw new Error("Not authorised to manage billing for this organisation");
  }
}
