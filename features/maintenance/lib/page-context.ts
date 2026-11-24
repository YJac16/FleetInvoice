import "server-only";

import { notFound, redirect } from "next/navigation";

import { UNAVAILABLE_PATH } from "@/lib/auth/hub-redirect";
import { assertMaintenanceAccess } from "@/lib/auth/maintenance-access";
import { getSessionContext } from "@/lib/auth/session";

export type MaintenancePageContext = {
  userId: string;
  organisationId: string;
  canManage: boolean;
};

/**
 * Page-level access for /maintenance. The layout already guards 'view'; pages
 * check again because Next renders layouts and pages independently, so a page
 * must never rely on its layout alone before reading data.
 *
 *   - 'view'   -> 404 unless the user may view; canManage tells the page
 *                 whether to show write controls.
 *   - 'manage' -> 404 unless the user may manage (new / edit pages).
 */
export async function getMaintenancePageContext(
  mode: "view" | "manage"
): Promise<MaintenancePageContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const organisationId = session.activeOrganisationId;
  if (!organisationId) notFound();

  const input = { organisationId, userId: session.userId };
  const [view, manage] = await Promise.all([
    mode === "view" ? assertMaintenanceAccess("view", input) : null,
    assertMaintenanceAccess("manage", input),
  ]);

  const allowed = mode === "view" ? view : manage;
  if (!allowed || !allowed.ok) {
    if (allowed && allowed.status === 401) redirect("/login");
    if (allowed && allowed.status === 503) redirect(UNAVAILABLE_PATH);
    notFound();
  }

  return { userId: session.userId, organisationId, canManage: manage.ok };
}
