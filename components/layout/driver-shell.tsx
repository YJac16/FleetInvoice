"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  CalendarDays,
  CircleUser,
  Clock,
  Home,
  LogOut,
} from "lucide-react";

import { OrgProvider } from "@/components/layout/org-context";
import { NotificationBell } from "@/features/driver-portal/components/notification-bell";
import {
  DriverPresenceProvider,
  useDriverPresence,
} from "@/features/driver-portal/hooks/use-driver-heartbeat";
import { APP_NAME } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { MembershipWithOrg, Profile } from "@/types";
import { cn } from "@/lib/utils";

const DRIVER_TABS = [
  { href: "/driver", label: "Today", icon: Home, exact: true },
  { href: "/driver/week", label: "Week", icon: CalendarDays },
  { href: "/driver/history", label: "History", icon: Clock },
  { href: "/driver/profile", label: "Profile", icon: CircleUser },
] as const;

function PresenceDot() {
  const { online } = useDriverPresence();

  return (
    <span
      className={cn(
        "size-2.5 rounded-full ring-2 ring-zinc-950",
        online ? "bg-emerald-500" : "bg-zinc-600"
      )}
      title={online ? "Online" : "Offline"}
    />
  );
}

function DriverHeader({ profile }: { profile: Profile }) {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const displayName = profile.full_name?.toUpperCase() ?? "DRIVER";

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 px-4 backdrop-blur md:px-6">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/driver"
            className="font-heading text-lg tracking-tight text-white"
          >
            {APP_NAME}
          </Link>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
            Driver
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <PresenceDot />
            <span className="max-w-[8rem] truncate text-xs font-medium text-zinc-300">
              {displayName}
            </span>
          </div>
          <NotificationBell />
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

function DriverBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
        {DRIVER_TABS.map((tab) => {
          const Icon = tab.icon;
          const active =
            "exact" in tab && tab.exact
              ? pathname === tab.href
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px]",
                active ? "text-white" : "text-zinc-500 hover:text-zinc-300"
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
      <div className="dark flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <DriverPresenceProvider>
          <DriverHeader profile={profile} />
          <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 pb-24 md:px-6">
            {children}
          </main>
          <DriverBottomNav />
        </DriverPresenceProvider>
      </div>
    </OrgProvider>
  );
}
