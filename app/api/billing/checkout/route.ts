import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { createYocoCheckout } from "@/lib/yoco";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!env.YOCO_SECRET_KEY) {
    return NextResponse.json({ error: "Yoco not configured" }, { status: 503 });
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
  if (planError || !plan?.monthly_price_cents || plan.monthly_price_cents <= 0) {
    return NextResponse.json(
      { error: "Plan has no monthly price configured" },
      { status: 400 }
    );
  }

  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role missing" }, { status: 503 });
  }

  const checkout = await createYocoCheckout({
    amountCents: plan.monthly_price_cents,
    currency: plan.currency ?? "ZAR",
    successUrl: `${env.NEXT_PUBLIC_APP_URL}/subscriptions?checkout=success`,
    cancelUrl: `${env.NEXT_PUBLIC_APP_URL}/subscriptions?checkout=cancel`,
    metadata: {
      organisation_id: body.organisationId,
      plan_id: body.planId,
    },
    idempotencyKey: `${body.organisationId}:${body.planId}:${plan.monthly_price_cents}`,
  });

  await admin.from("subscriptions").upsert(
    {
      organisation_id: body.organisationId,
      plan_id: body.planId,
      status: "incomplete",
      stripe_customer_id: checkout.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organisation_id" }
  );

  return NextResponse.json({ url: checkout.redirectUrl });
}
