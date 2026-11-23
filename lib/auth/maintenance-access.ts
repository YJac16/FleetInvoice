import type { SupabaseClient } from "@supabase/supabase-js";

import { APP_ROLES, type AppRole } from "@/lib/constants";
import { hasPermission, type Permission } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side guard for fleet maintenance (workshop bills, suppliers,
 * categories). Mirrors public.maintenance_assert_writer (00074):
 *
 *   - platform owner: allowed (bypasses the entitlement check, like the RPCs)
 *   - active organisation_admin / manager of the org: allowed if the org has
 *     an active/trialing subscription whose plan includes 'maintenance'
 *   - anyone else (driver, dispatcher, supervisor, employee, company_manager):
 *     forbidden
 *
 * Each mode is checked against its own permission in lib/permissions:
 * 'view' needs maintenance:view, 'manage' needs maintenance:manage. Today both
 * are held by exactly organisation_admin, manager and platform_owner, so the
 * outcome matches the RPCs; removing maintenance:manage from a role in the
 * permission matrix makes that role read-only here with no other change.
 * Pages use 'view'; routes that write (attachment upload/delete) use 'manage'.
 *
 * Reads go through the service client so the result doesn't depend on RLS
 * and matches the RPC check exactly.
 */

export type MaintenanceAccessMode = "view" | "manage";

/** Org roles the DB writer check (maintenance_assert_writer) accepts. The
 *  permission matrix is the source of truth here; a unit test keeps the two
 *  in step. */
export const MAINTENANCE_ROLES = ["organisation_admin", "manager"] as const;

export function maintenancePermissionFor(mode: MaintenanceAccessMode): Permission {
  return mode === "manage" ? "maintenance:manage" : "maintenance:view";
}

export type MaintenanceAccessDenied = {
  ok: false;
  status: 401 | 403 | 503;
  error: "unauthenticated" | "forbidden" | "module_not_entitled" | "service_unavailable";
  /** True when the user has no active membership in the org at all. Routes
   *  that look up a row by id should answer 404 in that case so another
   *  org's ids don't leak. */
  notMember: boolean;
};

export type MaintenanceAccessGranted = {
  ok: true;
  mode: MaintenanceAccessMode;
  userId: string;
  organisationId: string;
  isPlatformOwner: boolean;
  admin: SupabaseClient;
};

export type MaintenanceAccessResult = MaintenanceAccessGranted | MaintenanceAccessDenied;

function deny(
  status: MaintenanceAccessDenied["status"],
  error: MaintenanceAccessDenied["error"],
  notMember = false
): MaintenanceAccessDenied {
  return { ok: false, status, error, notMember };
}

/** Signed-in user id from the session cookie, or null. */
export async function getMaintenanceUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function isOrgEntitledToMaintenance(
  admin: SupabaseClient,
  organisationId: string
): Promise<boolean> {
  const { data: subs, error: subError } = await admin
    .from("subscriptions")
    .select("plan_id")
    .eq("organisation_id", organisationId)
    .in("status", ["trialing", "active"]);
  if (subError) throw subError;
  const planIds = (subs ?? [])
    .map((s: { plan_id: string | null }) => s.plan_id)
    .filter((id): id is string => Boolean(id));
  if (planIds.length === 0) return false;

  const { data: ents, error: entError } = await admin
    .from("module_entitlements")
    .select("plan_id")
    .in("plan_id", planIds)
    .eq("module_key", "maintenance")
    .limit(1);
  if (entError) throw entError;
  return (ents ?? []).length > 0;
}

/**
 * Check the signed-in user may use maintenance for `organisationId`.
 * Pass `userId` when the caller already resolved the session.
 */
export async function assertMaintenanceAccess(
  mode: MaintenanceAccessMode,
  input: { organisationId: string; userId?: string | null }
): Promise<MaintenanceAccessResult> {
  const userId = input.userId === undefined ? await getMaintenanceUserId() : input.userId;
  if (!userId) return deny(401, "unauthenticated");

  const admin = createServiceClient();
  if (!admin) return deny(503, "service_unavailable");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_platform_owner")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  const permission = maintenancePermissionFor(mode);

  if (profile?.is_platform_owner && hasPermission(null, permission, true)) {
    return { ok: true, mode, userId, organisationId: input.organisationId, isPlatformOwner: true, admin };
  }

  const { data: memberships, error: memberError } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", input.organisationId)
    .eq("user_id", userId)
    .eq("status", "active");
  if (memberError) throw memberError;
  const roles = (memberships ?? []).map((m: { role: string }) => String(m.role));
  if (roles.length === 0) return deny(403, "forbidden", true);
  const isKnownRole = (r: string): r is AppRole => (APP_ROLES as readonly string[]).includes(r);
  if (!roles.some((r) => isKnownRole(r) && hasPermission(r, permission))) {
    return deny(403, "forbidden");
  }

  if (!(await isOrgEntitledToMaintenance(admin, input.organisationId))) {
    return deny(403, "module_not_entitled");
  }

  return { ok: true, mode, userId, organisationId: input.organisationId, isPlatformOwner: false, admin };
}
