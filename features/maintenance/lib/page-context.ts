import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";

import { UNAVAILABLE_PATH } from "@/lib/auth/hub-redirect";
import { assertMaintenanceAccess, assertMaintenanceAdminAccess } from "@/lib/auth/maintenance-access";
import { getSessionContext } from "@/lib/auth/session";

export type MaintenancePageContext = {
  userId: string;
  organisationId: string;
  canManage: boolean;
  /** Platform owner or organisation_admin. Managers are false. */
  isAdmin: boolean;
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
  const [view, manage, adminAccess] = await Promise.all([
    mode === "view" ? assertMaintenanceAccess("view", input) : null,
    assertMaintenanceAccess("manage", input),
    assertMaintenanceAdminAccess(input),
  ]);

  const allowed = mode === "view" ? view : manage;
  if (!allowed || !allowed.ok) {
    if (allowed && allowed.status === 401) redirect("/login");
    if (allowed && allowed.status === 503) redirect(UNAVAILABLE_PATH);
    notFound();
  }

  return { userId: session.userId, organisationId, canManage: manage.ok, isAdmin: adminAccess.ok };
}

/**
 * Page-level access for admin-only pages (Worth keeping). Anyone who is not
 * the platform owner or an organisation_admin gets a 404, so the page's
 * existence isn't revealed. Returns the service client; use it only after
 * this call.
 */
export async function getMaintenanceAdminContext(): Promise<
  MaintenancePageContext & { admin: SupabaseClient }
> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const organisationId = session.activeOrganisationId;
  if (!organisationId) notFound();

  const access = await assertMaintenanceAdminAccess({ organisationId, userId: session.userId });
  if (!access.ok) {
    if (access.status === 401) redirect("/login");
    if (access.status === 503) redirect(UNAVAILABLE_PATH);
    notFound();
  }
  return { userId: session.userId, organisationId, canManage: true, isAdmin: true, admin: access.admin };
}
