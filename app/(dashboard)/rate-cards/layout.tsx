import { guardModulePage } from "@/lib/auth/module-guard";

export const dynamic = "force-dynamic";

/** Server guard for /rate-cards (billing). Not entitled -> 404; role without rate_cards:view -> 404 (see lib/auth/module-guard.ts). */
export default async function RateCardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardModulePage("billing", undefined, "rate_cards:view");
  return <>{children}</>;
}
