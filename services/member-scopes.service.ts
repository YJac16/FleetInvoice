import { createClient } from "@/lib/supabase/client";

export type MemberScope = {
  id: string;
  organisation_id: string;
  membership_id: string;
  company_id: string;
  created_by: string | null;
  created_at: string;
};

export async function listMemberScopes(
  organisationId: string,
  membershipId?: string
): Promise<MemberScope[]> {
  const supabase = createClient();
  let query = supabase
    .from("member_scopes")
    .select("*")
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: false });

  if (membershipId) {
    query = query.eq("membership_id", membershipId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MemberScope[];
}

export async function addMemberScope(input: {
  organisationId: string;
  membershipId: string;
  companyId: string;
}): Promise<MemberScope> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("member_scopes")
    .insert({
      organisation_id: input.organisationId,
      membership_id: input.membershipId,
      company_id: input.companyId,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as MemberScope;
}

export async function removeMemberScope(scopeId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("member_scopes")
    .delete()
    .eq("id", scopeId);
  if (error) throw error;
}
