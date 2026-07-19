import type { PricingStatus } from "@/types/database";

export const PRICING_STATUS_LABELS: Record<PricingStatus, string> = {
  calculated: "Calculated",
  needs_pricing: "Needs Pricing",
  manual_override: "Manual Override",
};

/** Tailwind-friendly badge classes per pricing status. */
export const PRICING_STATUS_STYLES: Record<PricingStatus, string> = {
  calculated:
    "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  needs_pricing:
    "border-transparent bg-orange-500/15 text-orange-700 dark:text-orange-400",
  manual_override:
    "border-transparent bg-purple-500/15 text-purple-700 dark:text-purple-400",
};

export const PRICING_CACHE_TTL_MS = 30_000;

export const AUDIT_ACTIONS = {
  tripCreated: "Trip Created",
  priceCalculated: "Price Calculated",
  priceRecalculated: "Price Recalculated",
  manualOverride: "Manual Override",
  priceLocked: "Price Locked",
} as const;
