"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { CompactSelect } from "@/components/shared/compact-select";

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
  const router = useRouter();
  const tabs = showWorthKeeping ? [...TABS, WORTH_KEEPING_TAB] : TABS;
  const current = tabs.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return (
    <>
    <CompactSelect
      className="-mt-2 mb-6 lg:hidden"
      label="Section"
      value={current?.href ?? ""}
      placeholder="Choose a section"
      options={tabs.map((t) => ({ value: t.href, label: t.label }))}
      onChange={(href) => router.push(href)}
    />
    <nav aria-label="Maintenance sections" className="-mt-2 mb-6 hidden gap-1 overflow-x-auto rounded-xl border bg-muted p-1 lg:inline-flex">
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
    </>
  );
}
