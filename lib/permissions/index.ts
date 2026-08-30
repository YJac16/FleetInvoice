import type { AppRole } from "@/lib/constants";

export type Permission =
  | "dashboard:view"
  | "organisations:view"
  | "organisations:manage"
  | "users:view"
  | "users:manage"
  | "drivers:view"
  | "drivers:manage"
  | "employees:view"
  | "employees:manage"
  | "vehicles:view"
  | "vehicles:manage"
  | "companies:view"
  | "companies:manage"
  | "areas:view"
  | "areas:manage"
  | "sites:view"
  | "sites:manage"
  | "pickup_points:view"
  | "pickup_points:manage"
  | "routes:view"
  | "routes:manage"
  | "schedules:view"
  | "schedules:manage"
  | "trips:view"
  | "trips:manage"
  | "trips:self"
  | "reports:view"
  | "settings:view"
  | "settings:manage"
  | "profile:view"
  | "attendance:view"
  | "attendance:manage"
  | "attendance:self"
  | "audit:view"
  | "fuel:view"
  | "fuel:manage"
  | "fuel:self"
  | "invoices:view"
  | "invoices:manage"
  | "rate_cards:view"
  | "rate_cards:manage"
  | "payroll:view"
  | "payroll:manage"
  | "gps:publish"
  | "gps:view"
  | "dispatch:view"
  | "geofences:view"
  | "geofences:manage"
  | "subscriptions:view"
  | "subscriptions:manage";

const VIEW_OPS: Permission[] = [
  "dashboard:view",
  "drivers:view",
  "employees:view",
  "vehicles:view",
  "companies:view",
  "areas:view",
  "sites:view",
  "pickup_points:view",
  "routes:view",
  "schedules:view",
  "trips:view",
  "reports:view",
  "settings:view",
  "profile:view",
  "fuel:view",
  "invoices:view",
  "rate_cards:view",
  "payroll:view",
  "gps:view",
  "dispatch:view",
  "geofences:view",
];

const MANAGE_OPS: Permission[] = [
  "drivers:manage",
  "employees:manage",
  "vehicles:manage",
  "companies:manage",
  "areas:manage",
  "sites:manage",
  "pickup_points:manage",
  "routes:manage",
  "schedules:manage",
  "trips:manage",
  "fuel:manage",
  "invoices:manage",
  "rate_cards:manage",
  "payroll:manage",
  "geofences:manage",
];

const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  platform_owner: [
    ...VIEW_OPS,
    ...MANAGE_OPS,
    "organisations:view",
    "organisations:manage",
    "subscriptions:view",
    "subscriptions:manage",
    "users:view",
    "users:manage",
    "settings:manage",
    "attendance:view",
    "attendance:manage",
    "audit:view",
  ],
  organisation_admin: [
    ...VIEW_OPS,
    ...MANAGE_OPS,
    "users:view",
    "users:manage",
    "settings:manage",
    "attendance:view",
    "attendance:manage",
    "audit:view",
    "subscriptions:view",
  ],
  manager: [
    ...VIEW_OPS,
    ...MANAGE_OPS,
    "users:view",
    "attendance:view",
    "attendance:manage",
    "audit:view",
  ],
  dispatcher: [
    ...VIEW_OPS,
    ...MANAGE_OPS,
    "attendance:view",
    "attendance:manage",
  ],
  supervisor: [
    ...VIEW_OPS,
    "drivers:manage",
    "employees:manage",
    "vehicles:manage",
    "sites:manage",
    "pickup_points:manage",
    "fuel:manage",
    "attendance:view",
    "attendance:manage",
    "gps:view",
    "dispatch:view",
  ],
  company_manager: [
    "dashboard:view",
    "companies:view",
    "employees:view",
    "drivers:view",
    "vehicles:view",
    "sites:view",
    "routes:view",
    "schedules:view",
    "trips:view",
    "reports:view",
    "profile:view",
    "attendance:view",
    "attendance:manage",
    "fuel:view",
    "invoices:view",
    "invoices:manage",
    "rate_cards:view",
  ],
  driver: [
    "dashboard:view",
    "profile:view",
    "trips:self",
    "fuel:self",
    "attendance:manage",
    "gps:publish",
  ],
  employee: [
    "dashboard:view",
    "profile:view",
    "trips:self",
    "attendance:self",
  ],
};

export function permissionsForRole(
  role: AppRole | null | undefined
): Permission[] {
  if (!role) return ["profile:view"];
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(
  role: AppRole | null | undefined,
  permission: Permission,
  isPlatformOwner = false
): boolean {
  if (isPlatformOwner) {
    return ROLE_PERMISSIONS.platform_owner.includes(permission);
  }
  return permissionsForRole(role).includes(permission);
}

export function hasAnyPermission(
  role: AppRole | null | undefined,
  permissions: Permission[],
  isPlatformOwner = false
): boolean {
  return permissions.some((p) =>
    hasPermission(role, p, isPlatformOwner)
  );
}
