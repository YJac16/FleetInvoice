import { redirect } from "next/navigation";

import { EmployeeShell } from "@/components/layout/employee-shell";
import { requireSession } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  if (!session.isPlatformOwner && session.memberships.length === 0) {
    redirect("/awaiting-invite");
  }

  return (
    <EmployeeShell
      profile={session.profile}
      memberships={session.memberships}
      activeOrganisationId={session.activeOrganisationId}
      isPlatformOwner={session.isPlatformOwner}
    >
      {children}
    </EmployeeShell>
  );
}
