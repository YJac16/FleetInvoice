import type { SupabaseClient } from "@supabase/supabase-js";

import { APP_ROLES, type AppRole } from "@/lib/constants";
import {
  FAIL_OPEN_MODULES,
  isAppModule,
  type AppModule,
} from "@/lib/entitlements";
import { hasPermission, type Permission } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Generic server-side module guard. The sidebar only hides links; pages,
 * layouts and API routes call this so a direct URL is refused too.
 *
 *   - no session                         -> 401 unauthenticated
 *   - service client missing             -> 503 service_unavailable
 *   - platform owner (with permission)   -> allowed, entitlement bypassed
 *   - no active membership in the org    -> 403 forbidden (notMember)
 *   - no role holding `permission`       -> 403 forbidden
 *   - org not entitled to `module`       -> 403 module_not_entitled
 *
 * Entitlements mirror public.org_entitled_modules: the union of module keys
 * across the org's trialing/active subscriptions. When that set is empty (no
 * subscription, or a plan with no rows) the org falls back to
 * FAIL_OPEN_MODULES, which never includes the NEVER_FAIL_OPEN modules.
 *
 * Reads go through the service client so the result doesn't depend on RLS.
 * Errors reading the tables are thrown (the caller's error boundary handles
 * them), never treated as "entitled".
 */

export type ModuleAccessError =
  | "unauthenticated"
  | "forbidden"
  | "module_not_entitled"
  | "service_unavailable";

export type ModuleAccessDenied = {
  ok: false;
  status: 401 | 403 | 503;
  error: ModuleAccessError;
  /** True when the user has no active membership in the org at all. Routes
   *  that look up a row by id should answer 404 so another org's ids don't
   *  leak. */
  notMember: boolean;
};

export type ModuleAccessGranted = {
  ok: true;
  module: AppModule;
  userId: string;
  organisationId: string;
  isPlatformOwner: boolean;
  admin: SupabaseClient;
};

export type ModuleAccessResult = ModuleAccessGranted | ModuleAccessDenied;

export type ModuleAccessInput = {
  organisationId: string;
  /** Pass when the caller already resolved the session; undefined = look up. */
  userId?: string | null;
  /** Permission at least one of the user's roles must hold. Omit to accept
   *  any active member. */
  permission?: Permission;
};

function deny(
  status: ModuleAccessDenied["status"],
  error: ModuleAccessError,
  notMember = false
): ModuleAccessDenied {
  return { ok: false, status, error, notMember };
}

/** Signed-in user id from the session cookie, or null. */
export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Modules the org is entitled to, resolved the same way as
 * public.org_entitled_modules plus the NEVER_FAIL_OPEN rule.
 */
export async function orgEntitledModules(
  admin: SupabaseClient,
  organisationId: string
): Promise<AppModule[]> {
  const { data: subs, error: subError } = await admin
    .from("subscriptions")
    .select("plan_id")
    .eq("organisation_id", organisationId)
    .in("status", ["trialing", "active"]);
  if (subError) throw subError;
  const planIds = (subs ?? [])
    .map((s: { plan_id: string | null }) => s.plan_id)
    .filter((id): id is string => Boolean(id));

  let keys: string[] = [];
  if (planIds.length > 0) {
    const { data: ents, error: entError } = await admin
      .from("module_entitlements")
      .select("module_key")
      .in("plan_id", planIds);
    if (entError) throw entError;
    keys = (ents ?? []).map((e: { module_key: string }) => String(e.module_key));
  }

  // Fail-open only when the DB has no entitlement rows at all, like the SQL
  // coalesce. Unknown keys don't count either way.
  if (keys.length === 0) return [...FAIL_OPEN_MODULES];
  return Array.from(new Set(keys.filter(isAppModule)));
}

export async function isOrgEntitledTo(
  admin: SupabaseClient,
  organisationId: string,
  module: AppModule
): Promise<boolean> {
  // FAIL_OPEN_MODULES excludes NEVER_FAIL_OPEN, so those modules are only
  // ever granted by a plan row.
  return (await orgEntitledModules(admin, organisationId)).includes(module);
}

/** Check the signed-in user may use `module` for `organisationId`. */
export function assertModuleAccess(
  module: AppModule,
  input: ModuleAccessInput
): Promise<ModuleAccessResult> {
  return assertAnyModuleAccess([module], input);
}

/**
 * Same checks as assertModuleAccess, but the org only needs to be entitled to
 * one of `modules` (e.g. /employees: passengers OR attendance). On success,
 * `module` is the first entry of `modules` the org is entitled to (the first
 * entry for a platform owner). Entitlements are read once.
 */
export async function assertAnyModuleAccess(
  modules: readonly [AppModule, ...AppModule[]],
  input: ModuleAccessInput
): Promise<ModuleAccessResult> {
  const userId =
    input.userId === undefined ? await getSessionUserId() : input.userId;
  if (!userId) return deny(401, "unauthenticated");

  const admin = createServiceClient();
  if (!admin) return deny(503, "service_unavailable");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_platform_owner")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;

  const granted = (isPlatformOwner: boolean, module: AppModule): ModuleAccessGranted => ({
    ok: true,
    module,
    userId,
    organisationId: input.organisationId,
    isPlatformOwner,
    admin,
  });

  if (
    profile?.is_platform_owner &&
    (!input.permission || hasPermission(null, input.permission, true))
  ) {
    return granted(true, modules[0]);
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

  if (input.permission) {
    const permission = input.permission;
    const isKnownRole = (r: string): r is AppRole =>
      (APP_ROLES as readonly string[]).includes(r);
    if (!roles.some((r) => isKnownRole(r) && hasPermission(r, permission))) {
      return deny(403, "forbidden");
    }
  }

  // orgEntitledModules applies the fail-open rule, so NEVER_FAIL_OPEN modules
  // are only ever matched through a plan row.
  const entitled = await orgEntitledModules(admin, input.organisationId);
  const match = modules.find((m) => entitled.includes(m));
  if (!match) return deny(403, "module_not_entitled");

  return granted(false, match);
}
