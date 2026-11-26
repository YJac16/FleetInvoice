import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertModuleAccess,
  getSessionUserId,
  isOrgEntitledTo,
  type ModuleAccessDenied,
  type ModuleAccessGranted,
} from "@/lib/auth/module-access";
import type { Permission } from "@/lib/permissions";

/**
 * Server-side guard for fleet maintenance (workshop bills, suppliers,
 * categories). Thin wrapper over the generic assertModuleAccess
 * (lib/auth/module-access.ts). Mirrors public.maintenance_assert_writer
 * (00074):
 *
 *   - platform owner: allowed (bypasses the entitlement check, like the RPCs)
 *   - active organisation_admin / manager of the org: allowed if the org has
 *     an active/trialing subscription whose plan includes 'maintenance'
 *     ('maintenance' is in NEVER_FAIL_OPEN, so no plan means no access)
 *   - anyone else (driver, dispatcher, supervisor, employee, company_manager):
 *     forbidden
 *
 * 'view' needs maintenance:view, 'manage' needs maintenance:manage. Pages use
 * 'view'; routes that write (attachment upload/delete) use 'manage'.
 */

export type MaintenanceAccessMode = "view" | "manage";

/** Org roles the DB writer check (maintenance_assert_writer) accepts. The
 *  permission matrix is the source of truth here; a unit test keeps the two
 *  in step. */
export const MAINTENANCE_ROLES = ["organisation_admin", "manager"] as const;

export function maintenancePermissionFor(mode: MaintenanceAccessMode): Permission {
  return mode === "manage" ? "maintenance:manage" : "maintenance:view";
}

export type MaintenanceAccessDenied = ModuleAccessDenied;

export type MaintenanceAccessGranted = Omit<ModuleAccessGranted, "module"> & {
  mode: MaintenanceAccessMode;
};

export type MaintenanceAccessResult = MaintenanceAccessGranted | MaintenanceAccessDenied;

/** Signed-in user id from the session cookie, or null. */
export const getMaintenanceUserId = getSessionUserId;

export function isOrgEntitledToMaintenance(
  admin: SupabaseClient,
  organisationId: string
): Promise<boolean> {
  return isOrgEntitledTo(admin, organisationId, "maintenance");
}

/**
 * Check the signed-in user may use maintenance for `organisationId`.
 * Pass `userId` when the caller already resolved the session.
 */
export async function assertMaintenanceAccess(
  mode: MaintenanceAccessMode,
  input: { organisationId: string; userId?: string | null }
): Promise<MaintenanceAccessResult> {
  const result = await assertModuleAccess("maintenance", {
    organisationId: input.organisationId,
    userId: input.userId,
    permission: maintenancePermissionFor(mode),
  });
  if (!result.ok) return result;
  const { module: _module, ...rest } = result;
  void _module;
  return { ...rest, mode };
}

/**
 * Admin-only guard (Worth keeping, intervals, rand amounts on Due): the
 * platform owner, or an active organisation_admin of the org with the
 * maintenance module. Managers are refused. Returns the same shape as
 * assertMaintenanceAccess; `admin` is the service client, so callers must
 * only use it after this check passes.
 */
export async function assertMaintenanceAdminAccess(input: {
  organisationId: string;
  userId?: string | null;
}): Promise<MaintenanceAccessResult> {
  const base = await assertMaintenanceAccess("manage", input);
  if (!base.ok || base.isPlatformOwner) return base;
  const { data, error } = await base.admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", base.organisationId)
    .eq("user_id", base.userId)
    .eq("status", "active");
  if (error) throw error;
  const isAdmin = (data ?? []).some((m: { role: string }) => m.role === "organisation_admin");
  if (!isAdmin) return { ok: false, status: 403, error: "forbidden", notMember: false };
  return base;
}
