import { createClient } from "@/lib/supabase/client";

export type OrgActorName = { user_id: string; display_name: string };

/**
 * Display names for "Entered by" / "Last edited by" (00088
 * list_org_actor_names). profiles RLS only exposes a caller's own profile,
 * so this definer RPC is the read path; it refuses drivers, employees and
 * company managers.
 */
export async function listOrgActorNames(organisationId: string): Promise<OrgActorName[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_org_actor_names", {
    p_organisation_id: organisationId,
  });
  if (error) throw error;
  return (data ?? []) as OrgActorName[];
}
