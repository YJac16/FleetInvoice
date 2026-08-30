import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(
    "organisation_admin",
    "manager",
    "dispatcher",
    "supervisor",
    "platform_owner"
  );

  return (
    <AppShell
      profile={session.profile}
      memberships={session.memberships}
      activeOrganisationId={session.activeOrganisationId}
      isPlatformOwner={session.isPlatformOwner}
    >
      {children}
    </AppShell>
  );
}
