import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function syncSubscription(
  organisationId: string,
  planId: string | undefined,
  stripeSub: Stripe.Subscription
) {
  const admin = createServiceClient();
  if (!admin) return;

  const statusMap: Record<string, string> = {
    trialing: "trialing",
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
    incomplete: "incomplete",
    incomplete_expired: "canceled",
    paused: "canceled",
  };

  const payload: Record<string, unknown> = {
    organisation_id: organisationId,
    status: statusMap[stripeSub.status] ?? "active",
    stripe_customer_id:
      typeof stripeSub.customer === "string"
        ? stripeSub.customer
        : stripeSub.customer.id,
    stripe_subscription_id: stripeSub.id,
    cancel_at_period_end: stripeSub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };
  const periodStart = (
    stripeSub as Stripe.Subscription & { current_period_start?: number }
  ).current_period_start;
  const periodEnd = (
    stripeSub as Stripe.Subscription & { current_period_end?: number }
  ).current_period_end;
  if (typeof periodStart === "number") {
    payload.current_period_start = new Date(periodStart * 1000).toISOString();
  }
  if (typeof periodEnd === "number") {
    payload.current_period_end = new Date(periodEnd * 1000).toISOString();
  }
  if (planId) payload.plan_id = planId;

  await admin.from("subscriptions").upsert(payload, {
    onConflict: "organisation_id",
  });
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const organisationId = session.metadata?.organisation_id;
    const planId = session.metadata?.plan_id;
    if (organisationId && session.subscription) {
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
      const stripeSub = await stripe.subscriptions.retrieve(subId);
      await syncSubscription(organisationId, planId, stripeSub);
    }
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const stripeSub = event.data.object as Stripe.Subscription;
    const organisationId =
      stripeSub.metadata?.organisation_id ??
      (await lookupOrgByCustomer(
        typeof stripeSub.customer === "string"
          ? stripeSub.customer
          : stripeSub.customer.id
      ));
    if (organisationId) {
      await syncSubscription(
        organisationId,
        stripeSub.metadata?.plan_id,
        stripeSub
      );
    }
  }

  return NextResponse.json({ received: true });
}

async function lookupOrgByCustomer(customerId: string) {
  const admin = createServiceClient();
  if (!admin) return null;
  const { data } = await admin
    .from("subscriptions")
    .select("organisation_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.organisation_id as string | null | undefined;
}
