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
] as const;

export type AppModule = (typeof APP_MODULES)[number];

export const ALL_MODULES: AppModule[] = [...APP_MODULES];

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
  if (permission.startsWith("reports:")) return "reports";
  return "core";
}
