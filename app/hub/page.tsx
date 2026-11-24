import { redirect } from "next/navigation";

import { hubPathForRole, NO_ACCESS_PATH } from "@/lib/auth/hub-redirect";
import { isHubNotEntitled } from "@/lib/auth/module-guard";
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

  // Company manager / employee whose org's plan lacks their hub: explain,
  // rather than bouncing through the hub layout.
  if (await isHubNotEntitled(session)) {
    redirect(NO_ACCESS_PATH);
  }

  redirect(hubPathForRole(session.activeRole, session.isPlatformOwner));
}
