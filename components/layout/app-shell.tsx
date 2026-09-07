"use client";

import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { OrgProvider } from "@/components/layout/org-context";
import type { MembershipWithOrg, Profile } from "@/types";

type AppShellProps = {
  children: ReactNode;
  profile: Profile;
  memberships: MembershipWithOrg[];
  activeOrganisationId: string | null;
  isPlatformOwner: boolean;
};

export function AppShell({
  children,
  profile,
  memberships,
  activeOrganisationId,
  isPlatformOwner,
}: AppShellProps) {
  return (
    <OrgProvider
      profile={profile}
      memberships={memberships}
      initialOrganisationId={activeOrganisationId}
      isPlatformOwner={isPlatformOwner}
    >
      <div className="flex min-h-screen bg-background">
        <div className="hidden md:block print:hidden">
          <div className="sticky top-0 h-screen">
            <AppSidebar />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="print:hidden">
            <AppHeader />
          </div>
          <main className="flex-1 px-4 py-8 md:px-8 print:p-0">{children}</main>
        </div>
      </div>
    </OrgProvider>
  );
}
