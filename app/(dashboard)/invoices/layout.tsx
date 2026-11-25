import { requirePermissionOrNotFound } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

/** Server guard for /invoices: roles without invoices:view get a 404. */
export default async function InvoicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermissionOrNotFound("invoices:view");
  return <>{children}</>;
}
