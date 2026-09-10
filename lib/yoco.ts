import { env } from "@/lib/env";

const YOCO_CHECKOUT_URL = "https://payments.yoco.com/api/checkouts";

type CreateCheckoutInput = {
  amountCents: number;
  currency?: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  idempotencyKey?: string;
};

type YocoCheckoutResponse = {
  id: string;
  redirectUrl: string;
  status?: string;
};

export async function createYocoCheckout(
  input: CreateCheckoutInput
): Promise<YocoCheckoutResponse> {
  const secretKey = env.YOCO_SECRET_KEY;
  if (!secretKey) {
    throw new Error("YOCO_SECRET_KEY is not configured");
  }

  const response = await fetch(YOCO_CHECKOUT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : {}),
    },
    body: JSON.stringify({
      amount: input.amountCents,
      currency: input.currency ?? "ZAR",
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      metadata: input.metadata,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Yoco checkout failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as YocoCheckoutResponse;
  if (!data.redirectUrl) {
    throw new Error("Yoco checkout did not return redirectUrl");
  }

  return data;
}
