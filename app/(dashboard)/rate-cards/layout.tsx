import { requirePermissionOrNotFound } from "@/lib/auth/require-permission";

export const dynamic = "force-dynamic";

/** Server guard for /rate-cards: roles without rate_cards:view get a 404. */
export default async function RateCardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermissionOrNotFound("rate_cards:view");
  return <>{children}</>;
}
