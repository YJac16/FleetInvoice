import type { Metadata } from "next";

import { PricingRulesClient } from "@/features/pricing/components/pricing-rules-client";
import {
  getPricingLookupOptions,
  listPricingRules,
} from "@/services/pricing.service";

export const metadata: Metadata = {
  title: "Pricing Rules",
};

export default async function PricingRulesPage() {
  const [rules, lookups] = await Promise.all([
    listPricingRules(),
    getPricingLookupOptions(),
  ]);

  return (
    <PricingRulesClient
      rules={rules}
      companies={lookups.companies}
      areas={lookups.areas}
      vehicles={lookups.vehicles}
      areaNames={lookups.areaNames}
    />
  );
}
