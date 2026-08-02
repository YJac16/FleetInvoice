import { redirect } from "next/navigation";

import { hubPathForRole } from "@/lib/auth/hub-redirect";
import { getSessionContext } from "@/lib/auth/session";
import type { AppRole } from "@/lib/constants";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { SessionContext } from "@/types";

export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
}

export async function requireRole(
  ...roles: AppRole[]
): Promise<SessionContext> {
  const session = await requireSession();

  if (!session.isPlatformOwner && session.memberships.length === 0) {
    redirect("/awaiting-invite");
  }

  // Platform owners only enter hubs that explicitly allow platform_owner
  // (ops dashboard). Other hubs require a matching membership role.
  if (session.isPlatformOwner && roles.includes("platform_owner")) {
    return session;
  }

  if (session.activeRole && roles.includes(session.activeRole)) {
    return session;
  }

  redirect(hubPathForRole(session.activeRole, session.isPlatformOwner));
}

export async function requirePermission(
  permission: Permission
): Promise<SessionContext> {
  const session = await requireSession();
  const allowed = hasPermission(
    session.activeRole,
    permission,
    session.isPlatformOwner
  );
  if (!allowed) {
    redirect(hubPathForRole(session.activeRole, session.isPlatformOwner));
  }
  return session;
}
