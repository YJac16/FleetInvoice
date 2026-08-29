import type { OrganisationMember, Profile } from "@/types";

export type MemberProfile = Pick<
  Profile,
  "id" | "email" | "full_name" | "avatar_url" | "phone"
>;

/**
 * PostgREST may return a many-to-one embed as an object, a one-element
 * array, or null when RLS hides the related row.
 */
export function normalizeProfileEmbed(
  value: unknown
): MemberProfile | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const profile = row as Partial<MemberProfile>;
  if (typeof profile.id !== "string" || profile.id.length === 0) return null;
  return {
    id: profile.id,
    email: profile.email ?? null,
    full_name: profile.full_name ?? null,
    avatar_url: profile.avatar_url ?? null,
    phone: profile.phone ?? null,
  };
}

export function memberDisplayName(member: OrganisationMember): string {
  const name = member.profiles?.full_name?.trim();
  if (name) return name;
  const email = member.profiles?.email?.trim();
  if (email) return email;
  return "—";
}

export function memberDisplayEmail(member: OrganisationMember): string {
  return member.profiles?.email?.trim() || "—";
}

export function attachMemberProfiles(
  members: OrganisationMember[],
  profiles: MemberProfile[]
): OrganisationMember[] {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return members.map((member) => {
    const embedded = normalizeProfileEmbed(member.profiles);
    const hydrated = byId.get(member.user_id) ?? embedded;
    return { ...member, profiles: hydrated ?? null };
  });
}
