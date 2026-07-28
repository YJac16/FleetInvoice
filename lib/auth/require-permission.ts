import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { SessionContext } from "@/types";

export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
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
  if (!allowed) redirect("/dashboard");
  return session;
}
