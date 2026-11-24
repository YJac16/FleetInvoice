import type { AppRole } from "@/lib/constants";
import type { Permission } from "@/lib/permissions";

/** Commercial module keys — must match module_entitlements.module_key check. */
export const APP_MODULES = [
  "core",
  "gps",
  "attendance",
  "billing",
  "payroll",
  "reports",
  "portal",
  "white_label",
  "sso",
  "integrations",
  "ai",
  "maintenance",
  "passengers",
] as const;

export type AppModule = (typeof APP_MODULES)[number];

export const ALL_MODULES: AppModule[] = [...APP_MODULES];

/**
 * Modules that are only ever granted by a plan that lists them, never by
 * fail-open. Maintenance is new and paid; portal (company_manager hub) and
 * passengers (employee hub, Employees screen) are hidden from the product.
 */
export const NEVER_FAIL_OPEN: readonly AppModule[] = [
  "maintenance",
  "portal",
  "passengers",
];

/**
 * Modules assumed when entitlements can't be read (RPC missing or failing,
 * still loading, or an org with no active plan). Excludes NEVER_FAIL_OPEN.
 * The server guard (lib/auth/module-access.ts) enforces the same rule.
 */
export const FAIL_OPEN_MODULES: AppModule[] = ALL_MODULES.filter(
  (m) => !NEVER_FAIL_OPEN.includes(m)
);

/**
 * Roles whose whole hub belongs to one module. When the org isn't entitled
 * to it, members with that role have no usable surface.
 */
export const ROLE_MODULE: Readonly<Partial<Record<AppRole, AppModule>>> = {
  company_manager: "portal",
  employee: "passengers",
};

export function isAppModule(value: string): value is AppModule {
  return (APP_MODULES as readonly string[]).includes(value);
}

export function hasModule(
  entitled: readonly AppModule[] | "all",
  module: AppModule
): boolean {
  if (entitled === "all") return true;
  return entitled.includes(module);
}

/**
 * True when `role` may be assigned in an org entitled to `entitled`. Roles in
 * ROLE_MODULE (company_manager -> portal, employee -> passengers) need their
 * module; every other role is always assignable.
 */
export function isRoleAllowedForModules(
  role: AppRole,
  entitled: readonly AppModule[] | "all"
): boolean {
  const requiredModule = ROLE_MODULE[role];
  return requiredModule ? hasModule(entitled, requiredModule) : true;
}

/** Subset of `roles` an admin may assign in an org entitled to `entitled`. */
export function assignableRoles<R extends AppRole>(
  roles: readonly R[],
  entitled: readonly AppModule[] | "all"
): R[] {
  return roles.filter((role) => isRoleAllowedForModules(role, entitled));
}

/** Map permission families to commercial modules for route soft-gating. */
export function moduleForPermission(permission: Permission): AppModule {
  if (permission.startsWith("gps:") || permission.startsWith("dispatch:") || permission.startsWith("geofences:")) {
    return "gps";
  }
  if (permission.startsWith("attendance:")) return "attendance";
  if (
    permission.startsWith("invoices:") ||
    permission.startsWith("rate_cards:")
  ) {
    return "billing";
  }
  if (permission.startsWith("payroll:")) return "payroll";
  if (permission.startsWith("maintenance:")) return "maintenance";
  if (permission.startsWith("reports:")) return "reports";
  return "core";
}
