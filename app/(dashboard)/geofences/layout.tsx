import { guardModulePage } from "@/lib/auth/module-guard";

export const dynamic = "force-dynamic";

/** Server guard for /geofences (gps). Not entitled -> 404 (see lib/auth/module-guard.ts). */
export default async function GeofencesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardModulePage("gps");
  return <>{children}</>;
}
