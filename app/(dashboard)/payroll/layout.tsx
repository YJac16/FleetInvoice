import { guardModulePage } from "@/lib/auth/module-guard";

export const dynamic = "force-dynamic";

/** Server guard for /payroll (payroll). Not entitled -> 404; role without payroll:view -> 404 (see lib/auth/module-guard.ts). */
export default async function PayrollLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardModulePage("payroll", undefined, "payroll:view");
  return <>{children}</>;
}
