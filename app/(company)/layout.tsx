import { redirect } from "next/navigation";

import { CompanyShell } from "@/components/layout/company-shell";
import { requireSession } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

export default async function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  if (!session.isPlatformOwner && session.memberships.length === 0) {
    redirect("/awaiting-invite");
  }

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
