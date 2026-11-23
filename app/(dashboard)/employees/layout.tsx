import { guardModulePage } from "@/lib/auth/module-guard";

export const dynamic = "force-dynamic";

/** Server guard for /employees: allowed with passengers OR attendance. Not entitled -> 404 (see lib/auth/module-guard.ts). */
export default async function EmployeesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardModulePage(["passengers", "attendance"]);
  return <>{children}</>;
}
