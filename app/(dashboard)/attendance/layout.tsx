import { guardModulePage } from "@/lib/auth/module-guard";

export const dynamic = "force-dynamic";

/** Server guard for /attendance (attendance). Not entitled -> 404 (see lib/auth/module-guard.ts). */
export default async function AttendanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardModulePage("attendance");
  return <>{children}</>;
}
