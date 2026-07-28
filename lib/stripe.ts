import Stripe from "stripe";

import { env } from "@/lib/env";

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  // Use account-default API version from the installed SDK.
  return new Stripe(env.STRIPE_SECRET_KEY);
}
