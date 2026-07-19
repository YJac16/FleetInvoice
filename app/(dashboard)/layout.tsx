import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { ROUTES } from "@/lib/constants";
import { hasSupabaseConfig } from "@/lib/env";
import { getSessionContext } from "@/services/profile.service";
import type { SessionContext } from "@/types/auth";

/** Dev fallback when Supabase env is not configured yet. */
const DEV_SESSION: SessionContext = {
  userId: "00000000-0000-0000-0000-000000000000",
  email: "admin@fleetinvoice.local",
  role: "admin",
  fullName: "Demo Admin",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session = await getSessionContext();

  if (!session && !hasSupabaseConfig()) {
    session = DEV_SESSION;
  }

  if (!session) {
    redirect(ROUTES.login);
  }

  return <AppShell session={session}>{children}</AppShell>;
}
