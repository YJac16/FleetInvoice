import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(",").map((part) => part.trim());
  for (const part of parts) {
    const [version, signature] = part.split("=");
    if (version !== "v1" || !signature) continue;
    const expected = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");
    try {
      if (
        timingSafeEqual(
          Buffer.from(signature, "hex"),
          Buffer.from(expected, "hex")
        )
      ) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

function readMetadata(
  payload: Record<string, unknown>
): { organisationId?: string; planId?: string } {
  const metadata =
    (payload.metadata as Record<string, unknown> | undefined) ??
    ((payload.data as Record<string, unknown> | undefined)?.metadata as
      | Record<string, unknown>
      | undefined);

  return {
    organisationId:
      typeof metadata?.organisation_id === "string"
        ? metadata.organisation_id
        : undefined,
    planId:
      typeof metadata?.plan_id === "string" ? metadata.plan_id : undefined,
  };
}

async function activateSubscription(input: {
  organisationId: string;
  planId: string;
  paymentId: string;
  checkoutId?: string;
}) {
  const admin = createServiceClient();
  if (!admin) return;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  await admin.from("subscriptions").upsert(
    {
      organisation_id: input.organisationId,
      plan_id: input.planId,
      status: "active",
      stripe_customer_id: input.checkoutId ?? null,
      stripe_subscription_id: input.paymentId,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      updated_at: now.toISOString(),
    },
    { onConflict: "organisation_id" }
  );
}

export async function POST(request: Request) {
  const webhookSecret = env.YOCO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Yoco webhook not configured" },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const signature =
    request.headers.get("webhook-signature") ??
    request.headers.get("x-yoco-signature");

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = String(payload.type ?? payload.event ?? "");
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const { organisationId, planId } = readMetadata(data);

  if (
    organisationId &&
    planId &&
    (eventType.includes("payment.succeeded") ||
      eventType.includes("checkout.payment.succeeded") ||
      eventType.includes("payment_succeeded"))
  ) {
    const paymentId =
      typeof data.id === "string"
        ? data.id
        : typeof data.payment_id === "string"
          ? data.payment_id
          : "yoco-payment";
    const checkoutId =
      typeof data.checkout_id === "string" ? data.checkout_id : undefined;

    await activateSubscription({
      organisationId,
      planId,
      paymentId,
      checkoutId,
    });
  }

  return NextResponse.json({ received: true });
}
