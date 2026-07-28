import { redirect } from "next/navigation";

import { hubPathForRole } from "@/lib/auth/hub-redirect";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HubPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  if (!session.isPlatformOwner && session.memberships.length === 0) {
    redirect("/awaiting-invite");
  }

  redirect(hubPathForRole(session.activeRole, session.isPlatformOwner));
}
