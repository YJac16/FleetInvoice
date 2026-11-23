import { guardModulePage } from "@/lib/auth/module-guard";

export const dynamic = "force-dynamic";

/** Server guard for /reports (reports). Not entitled -> 404 (see lib/auth/module-guard.ts). */
export default async function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardModulePage("reports");
  return <>{children}</>;
}
