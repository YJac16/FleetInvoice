"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/maintenance/bills", label: "Workshop bills" },
  { href: "/maintenance/due", label: "Due" },
  { href: "/maintenance/suppliers", label: "Suppliers" },
] as const;

const WORTH_KEEPING_TAB = { href: "/maintenance/vehicles", label: "Worth keeping" } as const;

/** `showWorthKeeping` is true for the platform owner and organisation_admin
 *  only; the page itself 404s for everyone else. */
export function MaintenanceTabs({ showWorthKeeping = false }: { showWorthKeeping?: boolean }) {
  const pathname = usePathname() ?? "";
  const tabs = showWorthKeeping ? [...TABS, WORTH_KEEPING_TAB] : TABS;
  return (
    <nav aria-label="Maintenance sections" className="-mt-2 mb-6 flex gap-1 overflow-x-auto rounded-xl border bg-muted p-1 sm:inline-flex">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium whitespace-nowrap transition-colors sm:flex-none",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
