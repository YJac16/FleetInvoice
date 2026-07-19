import { PRICING_CACHE_TTL_MS } from "@/lib/pricing/constants";
import type { MatchablePricingRule } from "@/lib/pricing/engine";

interface CacheEntry {
  expiresAt: number;
  rules: MatchablePricingRule[];
}

const ruleCache = new Map<string, CacheEntry>();

export function getCachedPricingRules(
  companyId: string
): MatchablePricingRule[] | null {
  const entry = ruleCache.get(companyId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    ruleCache.delete(companyId);
    return null;
  }
  return entry.rules;
}

export function setCachedPricingRules(
  companyId: string,
  rules: MatchablePricingRule[]
): void {
  ruleCache.set(companyId, {
    rules,
    expiresAt: Date.now() + PRICING_CACHE_TTL_MS,
  });
}

export function invalidatePricingCache(companyId?: string): void {
  if (companyId) {
    ruleCache.delete(companyId);
    return;
  }
  ruleCache.clear();
}
