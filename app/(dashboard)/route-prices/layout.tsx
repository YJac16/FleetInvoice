import { guardModulePage } from "@/lib/auth/module-guard";

export const dynamic = "force-dynamic";

/** Server guard for /route-prices (billing). Not entitled -> 404 (see lib/auth/module-guard.ts). */
export default async function RoutePricesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardModulePage("billing");
  return <>{children}</>;
}
