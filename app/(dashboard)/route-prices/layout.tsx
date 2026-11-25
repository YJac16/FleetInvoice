import { requirePermissionOrNotFound } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

/** Server guard for /route-prices: roles without rate_cards:view get a 404. */
export default async function RoutePricesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermissionOrNotFound("rate_cards:view");
  return <>{children}</>;
}
