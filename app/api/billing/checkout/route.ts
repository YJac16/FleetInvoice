import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    organisationId?: string;
    planId?: string;
  };
  if (!body.organisationId || !body.planId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("*")
    .eq("id", body.planId)
    .maybeSingle();
  if (planError || !plan?.stripe_price_id) {
    return NextResponse.json(
      { error: "Plan has no Stripe price" },
      { status: 400 }
    );
  }

  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role missing" }, { status: 503 });
  }

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organisation_id", body.organisationId)
    .maybeSingle();

  let customerId = sub?.stripe_customer_id as string | null | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { organisation_id: body.organisationId },
    });
    customerId = customer.id;
    await admin.from("subscriptions").upsert(
      {
        organisation_id: body.organisationId,
        plan_id: body.planId,
        status: "incomplete",
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organisation_id" }
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/subscriptions?checkout=success`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/subscriptions?checkout=cancel`,
    metadata: {
      organisation_id: body.organisationId,
      plan_id: body.planId,
    },
  });

  return NextResponse.json({ url: session.url });
}
