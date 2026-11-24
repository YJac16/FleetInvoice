import { notFound, redirect } from "next/navigation";

import { NO_ACCESS_PATH, UNAVAILABLE_PATH } from "@/lib/auth/hub-redirect";
import { assertMaintenanceAccess } from "@/lib/auth/maintenance-access";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Server guard for everything under /maintenance. Runs on every request,
 * independently of the sidebar (which only hides the link).
 *
 *   - no session            -> /login
 *   - no active org         -> 404
 *   - wrong role / not member -> 404 (don't reveal the module exists)
 *   - admin, plan lacks it  -> /app/no-access
 *   - service role missing  -> /app/unavailable
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
    if (access.status === 503) redirect(UNAVAILABLE_PATH);
    if (access.error === "module_not_entitled") redirect(NO_ACCESS_PATH);
    notFound();
  }

  return <>{children}</>;
}
