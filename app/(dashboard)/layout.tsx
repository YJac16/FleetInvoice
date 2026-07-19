import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { ROUTES } from "@/lib/constants";
import { hasSupabaseConfig } from "@/lib/env";
import {
  getDemoSessionContext,
  getSessionContext,
} from "@/services/profile.service";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session = await getSessionContext();

  if (!session && !hasSupabaseConfig()) {
    session = getDemoSessionContext();
  }

  if (!session) {
    redirect(ROUTES.login);
  }

  return <AppShell session={session}>{children}</AppShell>;
}
