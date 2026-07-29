import { EmployeeShell } from "@/components/layout/employee-shell";
import { requireRole } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("employee");

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
