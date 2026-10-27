"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  CalendarDays,
  CircleUser,
  Home,
  ListChecks,
  LogOut,
  PenLine,
} from "lucide-react";

import { GoOpsLogo } from "@/components/brand/goops-logo";
import { OrgProvider } from "@/components/layout/org-context";
import { PageFadeIn } from "@/components/shared/page-fade-in";
import { DriverThemeControl } from "@/features/driver-portal/components/driver-theme-control";
import { NotificationBell } from "@/features/driver-portal/components/notification-bell";
import { StaffTripGpsTracker } from "@/features/driver-portal/components/staff-trip-gps-tracker";
import {
  DriverPresenceProvider,
  useDriverPresence,
} from "@/features/driver-portal/hooks/use-driver-heartbeat";
import { driverHeaderName } from "@/features/driver-portal/lib/driver-header-name";
import { presenceStateLabel } from "@/features/driver-portal/lib/presence";
import { createClient } from "@/lib/supabase/client";
import type { MembershipWithOrg, Profile } from "@/types";
import { cn } from "@/lib/utils";

const DRIVER_TABS = [
  { href: "/driver", label: "Today", icon: Home, exact: true },
  { href: "/driver/log", label: "Log", icon: PenLine },
  { href: "/driver/submissions", label: "Mine", icon: ListChecks },
  { href: "/driver/week", label: "Week", icon: CalendarDays },
  { href: "/driver/profile", label: "Profile", icon: CircleUser },
] as const;

function PresenceDot() {
  const { state } = useDriverPresence();

  return (
    <span
      className={cn(
        "size-2.5 shrink-0 rounded-full ring-2 ring-background",
        state === "online" && "bg-emerald-500",
        state === "offline" && "bg-muted-foreground",
        state === "signing_out" && "bg-red-500"
      )}
      title={presenceStateLabel(state)}
      aria-label={presenceStateLabel(state)}
    />
  );
}

function DriverHeader({ profile }: { profile: Profile }) {
  const { markSigningOut } = useDriverPresence();

  async function signOut() {
    markSigningOut();
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const displayName = driverHeaderName(profile.full_name);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 px-3 backdrop-blur md:px-6">
      <div className="mx-auto flex min-h-14 max-w-lg items-center gap-1">
        <div className="shrink-0 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
          <GoOpsLogo size="sm" href="/driver" />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-0.5">
          <PresenceDot />
          <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
            {displayName}
          </span>
          <DriverThemeControl variant="icon" />
          <NotificationBell />
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
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
                "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px]",
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
      <div className="driver-portal flex min-h-screen min-w-0 flex-col overflow-x-clip bg-background text-foreground [color-scheme:light] dark:[color-scheme:dark]">
        <DriverPresenceProvider>
          <DriverHeader profile={profile} />
          <main className="mx-auto w-full min-w-0 max-w-lg flex-1 px-4 py-4 pb-24 md:px-6">
            <StaffTripGpsTracker />
            <PageFadeIn>{children}</PageFadeIn>
          </main>
          <DriverBottomNav />
        </DriverPresenceProvider>
      </div>
    </OrgProvider>
  );
}
