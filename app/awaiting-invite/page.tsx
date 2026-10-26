import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

/** Legacy route — self-serve onboarding replaced invite-only dead-end. */
export default async function AwaitingInvitePage() {
  const session = await requireSession();

  if (session.isPlatformOwner || session.memberships.length > 0) {
    redirect("/dashboard");
  }

  redirect("/onboarding/create-organisation");
}
