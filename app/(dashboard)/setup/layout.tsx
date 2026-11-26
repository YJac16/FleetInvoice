import { guardModulePage } from "@/lib/auth/module-guard";

export const dynamic = "force-dynamic";

/** Server guard for /setup (billing). Not entitled -> 404/no-access; role without invoices:manage -> 404 (see lib/auth/module-guard.ts). */
export default async function SetupHealthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardModulePage("billing", undefined, "invoices:manage");
  return <>{children}</>;
}
