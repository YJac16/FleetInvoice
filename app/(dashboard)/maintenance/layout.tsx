import { notFound, redirect } from "next/navigation";

import { assertMaintenanceAccess } from "@/lib/auth/maintenance-access";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Server guard for everything under /maintenance. Runs on every request,
 * independently of the sidebar (which only hides the link).
 *
 *   - no session            -> /login
 *   - no active org         -> 404
 *   - wrong role / no plan  -> 404 (don't reveal the module exists)
 *   - service role missing  -> error boundary
 *
 * Pages that write must additionally call assertMaintenanceAccess('manage').
 */
export default async function MaintenanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const organisationId = session.activeOrganisationId;
  if (!organisationId) notFound();

  const access = await assertMaintenanceAccess("view", {
    organisationId,
    userId: session.userId,
  });
  if (!access.ok) {
    if (access.status === 401) redirect("/login");
    if (access.status === 503) throw new Error("Maintenance is temporarily unavailable");
    notFound();
  }

  return <>{children}</>;
}
