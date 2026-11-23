import { EmployeeShell } from "@/components/layout/employee-shell";
import { guardModulePage } from "@/lib/auth/module-guard";
import { requireRole } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("employee");
  // The employee hub is the "passengers" module (NEVER_FAIL_OPEN): /app/no-access unless a plan lists it.
  await guardModulePage("passengers", session);

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
