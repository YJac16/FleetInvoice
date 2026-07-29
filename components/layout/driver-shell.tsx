"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  Bus,
  CircleUser,
  Fuel,
  QrCode,
} from "lucide-react";

import { OrgProvider, useOrg } from "@/components/layout/org-context";
import { APP_NAME } from "@/lib/constants";
import type { Permission } from "@/lib/permissions";
import type { MembershipWithOrg, Profile } from "@/types";
import { cn } from "@/lib/utils";

type TabItem = {
  href: string;
  label: string;
  icon: typeof Bus;
  permission?: Permission;
  exact?: boolean;
};

const DRIVER_TABS: TabItem[] = [
  { href: "/driver", label: "Trips", icon: Bus, exact: true },
  {
    href: "/driver/scan",
    label: "Scan",
    icon: QrCode,
    permission: "attendance:manage",
  },
  {
    href: "/driver/fuel",
    label: "Fuel",
    icon: Fuel,
    permission: "fuel:self",
  },
  { href: "/driver/profile", label: "Profile", icon: CircleUser },
];

function DriverHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-6">
      <Link href="/driver" className="font-heading text-lg tracking-tight">
        {APP_NAME}
      </Link>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        Driver
      </span>
    </header>
  );
}

function DriverBottomNav() {
  const pathname = usePathname();
  const { can } = useOrg();

  const visible = DRIVER_TABS.filter((tab) => {
    if (tab.href === "/driver" || tab.href === "/driver/profile") return true;
    if (tab.href === "/driver/scan") {
      return can("attendance:manage") || can("trips:self");
    }
    if (tab.permission) return can(tab.permission);
    return true;
  });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
        {visible.map((tab) => {
          const Icon = tab.icon;
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px]",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("size-5", active && "stroke-[2.25px]")} />
              <span className="truncate font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type DriverShellProps = {
  children: ReactNode;
  profile: Profile;
  memberships: MembershipWithOrg[];
  activeOrganisationId: string | null;
  isPlatformOwner: boolean;
};

export function DriverShell({
  children,
  profile,
  memberships,
  activeOrganisationId,
  isPlatformOwner,
}: DriverShellProps) {
  return (
    <OrgProvider
      profile={profile}
      memberships={memberships}
      initialOrganisationId={activeOrganisationId}
      isPlatformOwner={isPlatformOwner}
    >
      <div className="flex min-h-screen flex-col bg-background">
        <DriverHeader />
        <main className="flex-1 px-4 py-6 pb-24 md:px-6">{children}</main>
        <DriverBottomNav />
      </div>
    </OrgProvider>
  );
}
