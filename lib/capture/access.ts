import type { createServiceClient } from "@/lib/supabase/admin";

const CAPTURE_ROLES = [
  "organisation_admin",
  "manager",
  "dispatcher",
  "supervisor",
] as const;

export async function assertFleetCaptureAccess(
  admin: NonNullable<ReturnType<typeof createServiceClient>>,
  userId: string,
  organisationId: string
): Promise<{ ok: true } | { ok: false; status: number; code: string }> {
  const { data: member, error } = await admin
    .from("organisation_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organisation_id", organisationId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !member) {
    return { ok: false, status: 403, code: "forbidden" };
  }

  if (!CAPTURE_ROLES.includes(member.role as (typeof CAPTURE_ROLES)[number])) {
    return { ok: false, status: 403, code: "forbidden" };
  }

  return { ok: true };
}
