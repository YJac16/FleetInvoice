"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { OrgProvider, useOrg } from "@/components/layout/org-context";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import type { Permission } from "@/lib/permissions";
import { signOut } from "@/services/auth.service";
import type { MembershipWithOrg, Profile } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

const COMPANY_NAV: { href: string; label: string; permission: Permission }[] = [
  { href: "/company", label: "Home", permission: "dashboard:view" },
  { href: "/company/fuel", label: "Fuel", permission: "fuel:view" },
  { href: "/company/fleet", label: "Fleet", permission: "vehicles:view" },
  { href: "/company/invoices", label: "Invoices", permission: "invoices:view" },
  { href: "/company/reports", label: "Reports", permission: "reports:view" },
];

function CompanyHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, can } = useOrg();

  async function handleSignOut() {
    try {
      await signOut();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to sign out"));
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <Link href="/company" className="font-heading text-lg tracking-tight">
          {APP_NAME}
        </Link>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          Company hub
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" render={<Link href="/profile" />}>
            {profile.full_name || "Profile"}
          </Button>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleSignOut()}
          >
            Sign out
          </Button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:px-6">
        {COMPANY_NAV.filter((item) => can(item.permission)).map((item) => {
          const active =
            item.href === "/company"
              ? pathname === "/company"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

type CompanyShellProps = {
  children: ReactNode;
  profile: Profile;
  memberships: MembershipWithOrg[];
  activeOrganisationId: string | null;
  isPlatformOwner: boolean;
};

export function CompanyShell({
  children,
  profile,
  memberships,
  activeOrganisationId,
  isPlatformOwner,
}: CompanyShellProps) {
  return (
    <OrgProvider
      profile={profile}
      memberships={memberships}
      initialOrganisationId={activeOrganisationId}
      isPlatformOwner={isPlatformOwner}
    >
      <div className="flex min-h-screen flex-col bg-background">
        <CompanyHeader />
        <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </OrgProvider>
  );
}
