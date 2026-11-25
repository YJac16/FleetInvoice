import { guardModulePage } from "@/lib/auth/module-guard";

export const dynamic = "force-dynamic";

/** Server guard for /invoices (billing), including /invoices/[id]/print. Not entitled -> 404; role without invoices:view -> 404 (see lib/auth/module-guard.ts). */
export default async function InvoicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardModulePage("billing", undefined, "invoices:view");
  return <>{children}</>;
}
