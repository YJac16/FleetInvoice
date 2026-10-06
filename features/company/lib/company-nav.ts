import type { Permission } from "@/lib/permissions";

export const COMPANY_NAV: {
  href: string;
  label: string;
  permission: Permission;
}[] = [
  { href: "/company", label: "Home", permission: "dashboard:view" },
  { href: "/company/invoices", label: "Invoices", permission: "invoices:view" },
  { href: "/company/reports", label: "Reports", permission: "reports:view" },
];

export function companyNavItems(
  can: (permission: Permission) => boolean
): typeof COMPANY_NAV {
  return COMPANY_NAV.filter((item) => can(item.permission));
}
