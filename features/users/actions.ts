"use server";

import { getSessionContext } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { MemberProfile } from "@/features/users/lib/member-profile";
import { inviteSchema, roleSchema } from "@/features/users/schemas/user";
import { assertRoleAssignable } from "@/lib/auth/role-assignment";
import type { Invitation } from "@/types";

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

export type RoleActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; message: string };

/**
 * Create an invitation. Refuses company_manager / employee when the org isn't
 * entitled to portal / passengers (lib/auth/role-assignment.ts), then calls
 * create_invitation as the signed-in user so its own checks still apply.
 */
export async function createInvitationAction(input: {
  organisationId: string;
  email: string;
  role: string;
}): Promise<RoleActionResult<Invitation>> {
  const parsed = inviteSchema.safeParse({ email: input.email, role: input.role });
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Invalid invitation",
    };
  }

  const check = await assertRoleAssignable({
    organisationId: input.organisationId,
    role: parsed.data.role,
  });
  if (!check.ok) return check;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_organisation_id: input.organisationId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) return { ok: false, status: 400, error: "rpc_error", message: error.message };
  return { ok: true, data: data as Invitation };
}

/**
 * Change a member's role. The entitlement rule applies to the target role
 * only: moving an existing employee to driver is fine; making someone an
 * employee in an org without passengers is refused.
 */
export async function updateMemberRoleAction(input: {
  memberId: string;
  role: string;
}): Promise<RoleActionResult<{ id: string; organisation_id: string }>> {
  const parsed = roleSchema.safeParse({ role: input.role });
  if (!parsed.success) {
    return { ok: false, status: 400, error: "invalid_role", message: "That role can't be assigned." };
  }

  const supabase = await createClient();
  const { data: member, error: memberError } = await supabase
    .from("organisation_members")
    .select("id, organisation_id")
    .eq("id", input.memberId)
    .is("deleted_at", null)
    .maybeSingle();
  if (memberError) {
    return { ok: false, status: 400, error: "query_error", message: memberError.message };
  }
  if (!member) {
    return { ok: false, status: 404, error: "not_found", message: "Member not found." };
  }

  const check = await assertRoleAssignable({
    organisationId: member.organisation_id as string,
    role: parsed.data.role,
  });
  if (!check.ok) return check;

  const { data, error } = await supabase
    .from("organisation_members")
    .update({ role: parsed.data.role })
    .eq("id", member.id)
    .select("id, organisation_id")
    .single();
  if (error) return { ok: false, status: 400, error: "update_error", message: error.message };
  return { ok: true, data: data as { id: string; organisation_id: string } };
}
