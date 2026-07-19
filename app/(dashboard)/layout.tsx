import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { ADMIN_ONLY_ROUTES, ROUTES } from "@/lib/constants";
import { hasSupabaseConfig } from "@/lib/env";
import {
  getDemoAdminSessionContext,
  getDemoSessionContext,
  getSessionContext,
} from "@/services/profile.service";

function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session = await getSessionContext();

  if (!session && !hasSupabaseConfig()) {
    const headerStore = await headers();
    const pathname =
      headerStore.get("x-pathname") ??
      headerStore.get("x-invoke-path") ??
      "";
    const demoRole = process.env.NEXT_PUBLIC_DEMO_ROLE;
    session =
      demoRole === "admin" || isAdminOnlyPath(pathname)
        ? getDemoAdminSessionContext()
        : getDemoSessionContext();
  }

  if (!session) {
    redirect(ROUTES.login);
  }

  return <AppShell session={session}>{children}</AppShell>;
}
