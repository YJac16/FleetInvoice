import { CompanyShell } from "@/components/layout/company-shell";
import { guardModulePage } from "@/lib/auth/module-guard";
import { requireRole } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

export default async function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("company_manager");
  // The company manager hub is the "portal" module (NEVER_FAIL_OPEN): 404 unless a plan lists it.
  await guardModulePage("portal", session);

  return (
    <CompanyShell
      profile={session.profile}
      memberships={session.memberships}
      activeOrganisationId={session.activeOrganisationId}
      isPlatformOwner={session.isPlatformOwner}
    >
      {children}
    </CompanyShell>
  );
}
