import {
  Building2,
  Bus,
  Calendar,
  Car,
  CircleUser,
  CreditCard,
  FileText,
  Fuel,
  LayoutDashboard,
  MapPin,
  MapPinned,
  Route as RouteIcon,
  Settings,
  Users,
  UsersRound,
  Warehouse,
  BarChart3,
  Building,
  Radar,
  type LucideIcon,
} from "lucide-react";

import type { AppModule } from "@/lib/entitlements";
import { moduleForPermission } from "@/lib/entitlements";
import type { Permission } from "@/lib/permissions";

export type NavGroupId =
  | "overview"
  | "people"
  | "fleet"
  | "places"
  | "planning"
  | "ops"
  | "finance"
  | "system";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  module: AppModule;
  group: NavGroupId;
};

export type NavGroup = {
  id: NavGroupId;
  label: string;
};

export const NAV_GROUPS: NavGroup[] = [
  { id: "overview", label: "Overview" },
  { id: "people", label: "People" },
  { id: "fleet", label: "Fleet" },
  { id: "places", label: "Places" },
  { id: "planning", label: "Planning" },
  { id: "ops", label: "Ops" },
  { id: "finance", label: "Finance" },
  { id: "system", label: "System" },
];

function item(
  title: string,
  href: string,
  icon: LucideIcon,
  permission: Permission,
  group: NavGroupId,
  module?: AppModule
): NavItem {
  return {
    title,
    href,
    icon,
    permission,
    group,
    module: module ?? moduleForPermission(permission),
  };
}

export const MAIN_NAV: NavItem[] = [
  item("Dashboard", "/dashboard", LayoutDashboard, "dashboard:view", "overview"),
  item("Users", "/users", Users, "users:view", "people"),
  item("Drivers", "/drivers", CircleUser, "drivers:view", "people"),
  item("Employees", "/employees", UsersRound, "employees:view", "people"),
  item("Vehicles", "/vehicles", Car, "vehicles:view", "fleet"),
  item("Fuel", "/fuel", Fuel, "fuel:view", "fleet"),
  item("Companies", "/companies", Building2, "companies:view", "places"),
  item("Areas", "/areas", MapPin, "areas:view", "places"),
  item("Sites", "/sites", Warehouse, "sites:view", "places"),
  item("Pickup Points", "/pickup-points", MapPinned, "pickup_points:view", "places"),
  item("Routes", "/routes", RouteIcon, "routes:view", "planning"),
  item("Schedules", "/schedules", Calendar, "schedules:view", "planning"),
  item("Trips", "/trips", Bus, "trips:view", "planning"),
  item("Dispatch", "/dispatch", Radar, "dispatch:view", "ops", "gps"),
  item("Geofences", "/geofences", MapPin, "geofences:view", "ops", "gps"),
  item("Attendance", "/attendance", UsersRound, "attendance:view", "ops", "attendance"),
  item("Invoices", "/invoices", FileText, "invoices:view", "finance", "billing"),
  item("Rate cards", "/rate-cards", FileText, "rate_cards:view", "finance", "billing"),
  item("Pay rates", "/pay-rates", FileText, "payroll:view", "finance", "payroll"),
  item("Payroll", "/payroll", FileText, "payroll:view", "finance", "payroll"),
  item("Reports", "/reports", BarChart3, "reports:view", "finance", "reports"),
  item("Organisations", "/organisations", Building, "organisations:view", "system"),
  item("Membership", "/subscriptions", CreditCard, "subscriptions:view", "system", "core"),
  item("White-label", "/white-label", Building, "organisations:manage", "system", "core"),
];

export const SECONDARY_NAV: NavItem[] = [
  item("Settings", "/settings", Settings, "settings:view", "system"),
];
