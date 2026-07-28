import { cookies } from "next/headers";

import { ORG_COOKIE_NAME } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { MembershipWithOrg, Profile, SessionContext } from "@/types";

export async function getSessionContext(): Promise<SessionContext | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Profile not found");
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("organisation_members")
    .select(
      "*, organisations:organisation_id (id, name, slug, status)"
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .eq("status", "active");

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const typedMemberships = (memberships ?? []) as MembershipWithOrg[];
  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ORG_COOKIE_NAME)?.value ?? null;

  const activeOrganisationId =
    typedMemberships.find((m) => m.organisation_id === cookieOrgId)
      ?.organisation_id ??
    typedMemberships[0]?.organisation_id ??
    null;

  const activeMembership = typedMemberships.find(
    (m) => m.organisation_id === activeOrganisationId
  );

  return {
    userId: user.id,
    email: user.email ?? profile.email,
    profile: profile as Profile,
    memberships: typedMemberships,
    activeOrganisationId,
    activeRole: activeMembership?.role ?? null,
    isPlatformOwner: Boolean(profile.is_platform_owner),
  };
}
