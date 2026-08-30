"use server";

import { getSessionContext } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { MemberProfile } from "@/features/users/lib/member-profile";

function assertOrgAccess(
  organisationId: string,
  session: {
    isPlatformOwner: boolean;
    memberships: Array<{ organisation_id: string }>;
  }
) {
  if (session.isPlatformOwner) return;
  const isMember = session.memberships.some(
    (membership) => membership.organisation_id === organisationId
  );
  if (!isMember) {
    throw new Error("You are not a member of this organisation.");
  }
}

/**
 * Profiles RLS only allows `id = auth.uid()`, so the members embed is empty
 * for everyone except the signed-in user. After the caller loads members
 * under their own RLS, this fills in name/email for those user ids.
 */
export async function hydrateMemberProfiles(
  organisationId: string,
  userIds: string[]
): Promise<MemberProfile[]> {
  const session = await getSessionContext();
  if (!session) throw new Error("Not signed in");
  assertOrgAccess(organisationId, session);

  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const supabase = await createClient();
  const { data: memberRows, error: memberError } = await supabase
    .from("organisation_members")
    .select("user_id")
    .eq("organisation_id", organisationId)
    .in("user_id", uniqueIds)
    .is("deleted_at", null);
  if (memberError) throw memberError;

  const allowedIds = [
    ...new Set((memberRows ?? []).map((row) => row.user_id as string)),
  ];
  if (allowedIds.length === 0) return [];

  const privileged = createServiceClient();
  if (!privileged) return [];

  const { data, error } = await privileged
    .from("profiles")
    .select("id, email, full_name, avatar_url, phone")
    .in("id", allowedIds);
  if (error) throw error;
  return (data ?? []) as MemberProfile[];
}
