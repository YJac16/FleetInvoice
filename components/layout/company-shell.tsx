"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { GoOpsLogo } from "@/components/brand/goops-logo";
import { OrgProvider, useOrg } from "@/components/layout/org-context";
import { PortalClock } from "@/components/layout/portal-clock";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { COMPANY_NAV } from "@/features/company/lib/company-nav";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { listCompanies } from "@/services/companies.service";
import { signOut } from "@/services/auth.service";
import type { MembershipWithOrg, Profile } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

function CompanyHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, can } = useOrg();
  const organisationId = useActiveOrgId();
  const companiesQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.companies(organisationId)
      : ["companies", "none"],
    queryFn: () => listCompanies(organisationId!),
    enabled: Boolean(organisationId),
  });
  const companyName =
    companiesQuery.data && companiesQuery.data.length > 0
      ? companiesQuery.data.map((company) => company.name).join(", ")
      : null;

  async function handleSignOut() {
    try {
      await signOut();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to sign out"));
    }
  }

  const companyLabel = companyName ? companyName : "Company hub";
  const profileLabel = profile.full_name || "Profile";

  return (
    <header className="sticky top-0 z-30 min-w-0 border-b bg-background/90 backdrop-blur">
      <div className="flex h-14 min-w-0 items-center gap-2 px-3 md:gap-3 md:px-6">
        <div className="shrink-0">
          <GoOpsLogo size="sm" href="/company" />
        </div>
        <span className="hidden min-w-0 truncate rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline">
          {companyLabel}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="hidden max-w-56 sm:inline-flex"
            render={<Link href="/company/profile" />}
          >
            <span className="truncate">{profileLabel}</span>
          </Button>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 px-2"
            onClick={() => void handleSignOut()}
          >
            Sign out
          </Button>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-3 px-3 pb-1 sm:hidden">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {companyLabel}
        </span>
        <Link
          href="/company/profile"
          className="inline-flex min-h-11 min-w-0 max-w-[50%] items-center truncate text-xs font-medium text-foreground"
        >
          {profileLabel}
        </Link>
      </div>
      <div className="flex min-w-0 items-center gap-2 px-3 pb-2 md:gap-3 md:px-6">
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
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
        <PortalClock className="ml-auto shrink-0" />
      </div>
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
      <div className="invoice-print-flow flex min-h-screen flex-col bg-background">
        <div className="print:hidden">
          <CompanyHeader />
        </div>
        <main className="invoice-print-flow flex-1 px-4 py-6 md:px-6 print:p-0">
          {children}
        </main>
      </div>
    </OrgProvider>
  );
}
