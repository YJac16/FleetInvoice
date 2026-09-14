import { createHmac, timingSafeEqual } from "node:crypto";

function decodeWebhookSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  const encoded = trimmed.startsWith("whsec_")
    ? trimmed.slice("whsec_".length)
    : trimmed;
  return Buffer.from(encoded, "base64");
}

export function verifyYocoWebhookSignature(input: {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  secret: string;
}): boolean {
  const { rawBody, webhookId, webhookTimestamp, webhookSignature, secret } =
    input;

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return false;
  }

  const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const key = decodeWebhookSecret(secret);
  const expected = createHmac("sha256", key)
    .update(signedPayload, "utf8")
    .digest("base64");

  const entries = webhookSignature.split(/\s+/).map((part) => part.trim());
  for (const entry of entries) {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) continue;
    try {
      if (
        timingSafeEqual(
          Buffer.from(signature, "base64"),
          Buffer.from(expected, "base64")
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
