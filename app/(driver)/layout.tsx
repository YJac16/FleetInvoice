import { DriverShell } from "@/components/layout/driver-shell";
import { requireRole } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("driver");

  return (
    <DriverShell
      profile={session.profile}
      memberships={session.memberships}
      activeOrganisationId={session.activeOrganisationId}
      isPlatformOwner={session.isPlatformOwner}
    >
      {children}
    </DriverShell>
  );
}
