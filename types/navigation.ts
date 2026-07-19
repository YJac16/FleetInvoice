import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/types/database";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. Omit for all authenticated users. */
  roles?: UserRole[];
  description?: string;
}
