import {
  APP_ROLES,
  INVITABLE_ROLES,
  ROLE_LABELS,
  type AppRole,
  type InvitableRole,
} from "@/lib/constants";
import { ROLE_MODULE } from "@/lib/entitlements";
import { getSessionUserId, isOrgEntitledTo } from "@/lib/auth/module-access";
import { hasPermission } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Server-side check before an admin invites someone with, or changes a member
 * to, `role` in `organisationId`. The users page hides gated roles; this
 * refuses them when called directly.
 *
 *   - role not invitable                     -> 400 invalid_role
 *   - no session                             -> 401 unauthenticated
 *   - service client missing                 -> 503 service_unavailable
 *   - platform owner                         -> allowed (entitlement bypassed)
 *   - no active membership with users:manage -> 403 forbidden
 *   - ROLE_MODULE role, org not entitled     -> 403 role_not_entitled
 *
 * Entitlements come from isOrgEntitledTo, so fail-open never grants portal
 * or passengers (NEVER_FAIL_OPEN).
 */

export type RoleAssignmentError =
  | "invalid_role"
  | "unauthenticated"
  | "forbidden"
  | "role_not_entitled"
  | "service_unavailable";

export type RoleAssignmentDenied = {
  ok: false;
  status: 400 | 401 | 403 | 503;
  error: RoleAssignmentError;
  message: string;
};

export type RoleAssignmentResult =
  | { ok: true; role: InvitableRole; userId: string; isPlatformOwner: boolean }
  | RoleAssignmentDenied;

function deny(
  status: RoleAssignmentDenied["status"],
  error: RoleAssignmentError,
  message: string
): RoleAssignmentDenied {
  return { ok: false, status, error, message };
}

function isInvitableRole(role: string): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}

function isAppRole(role: string): role is AppRole {
  return (APP_ROLES as readonly string[]).includes(role);
}

export async function assertRoleAssignable(input: {
  organisationId: string;
  role: string;
}): Promise<RoleAssignmentResult> {
  const { organisationId, role } = input;
  if (!isInvitableRole(role)) {
    return deny(400, "invalid_role", "That role can't be assigned.");
  }

  const userId = await getSessionUserId();
  if (!userId) return deny(401, "unauthenticated", "Not signed in.");

  const admin = createServiceClient();
  if (!admin) {
    return deny(503, "service_unavailable", "User management is temporarily unavailable.");
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_platform_owner")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profile?.is_platform_owner) {
    return { ok: true, role, userId, isPlatformOwner: true };
  }

  const { data: memberships, error: memberError } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .eq("status", "active");
  if (memberError) throw memberError;
  const roles = (memberships ?? []).map((m: { role: string }) => String(m.role));
  if (!roles.some((r) => isAppRole(r) && hasPermission(r, "users:manage"))) {
    return deny(403, "forbidden", "You can't manage users in this organisation.");
  }

  const requiredModule = ROLE_MODULE[role];
  if (requiredModule && !(await isOrgEntitledTo(admin, organisationId, requiredModule))) {
    return deny(
      403,
      "role_not_entitled",
      `${ROLE_LABELS[role]} isn't available on this organisation's plan.`
    );
  }

  return { ok: true, role, userId, isPlatformOwner: false };
}
