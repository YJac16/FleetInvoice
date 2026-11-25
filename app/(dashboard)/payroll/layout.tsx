import { requirePermissionOrNotFound } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

/** Server guard for /payroll: roles without payroll:view get a 404. */
export default async function PayrollLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermissionOrNotFound("payroll:view");
  return <>{children}</>;
}
