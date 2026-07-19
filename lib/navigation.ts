import {
  Building2,
  Car,
  FileText,
  LayoutDashboard,
  MapPinned,
  PlusCircle,
  Receipt,
  Settings,
  Tags,
  Truck,
  Users,
} from "lucide-react";

import { ROUTES } from "@/lib/constants";
import type { NavItem } from "@/types/navigation";
import type { UserRole } from "@/types/database";

/** Primary sidebar navigation. Filtered by role at render time. */
export const NAV_ITEMS: NavItem[] = [
  {
    title: "Dashboard",
    href: ROUTES.dashboard,
    icon: LayoutDashboard,
    description: "Overview of fleet activity",
  },
  {
    title: "New Trip",
    href: ROUTES.tripsNew,
    icon: PlusCircle,
    roles: ["driver"],
    description: "Log a completed trip",
  },
  {
    title: "My Trips",
    href: ROUTES.trips,
    icon: Truck,
    description: "Trip submissions and status",
  },
  {
    title: "Drivers",
    href: ROUTES.drivers,
    icon: Users,
    roles: ["admin"],
    description: "Driver directory",
  },
  {
    title: "Companies",
    href: ROUTES.companies,
    icon: Building2,
    roles: ["admin"],
    description: "Customer companies",
  },
  {
    title: "Vehicles",
    href: ROUTES.vehicles,
    icon: Car,
    roles: ["admin"],
    description: "Fleet vehicles",
  },
  {
    title: "Areas",
    href: ROUTES.areas,
    icon: MapPinned,
    roles: ["admin"],
    description: "Service areas and zones",
  },
  {
    title: "Pricing Rules",
    href: ROUTES.pricingRules,
    icon: Tags,
    roles: ["admin"],
    description: "Company pricing rules",
  },
  {
    title: "Invoices",
    href: ROUTES.invoices,
    icon: Receipt,
    roles: ["admin"],
    description: "Weekly invoices",
  },
  {
    title: "Reports",
    href: ROUTES.reports,
    icon: FileText,
    roles: ["admin"],
    description: "Operational reports",
  },
  {
    title: "Settings",
    href: ROUTES.settings,
    icon: Settings,
    description: "Account and preferences",
  },
];

export function getNavItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(role)
  );
}

export function isAdminOnlyPath(pathname: string): boolean {
  return NAV_ITEMS.some(
    (item) =>
      item.roles?.includes("admin") &&
      !item.roles.includes("driver") &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`))
  );
}
