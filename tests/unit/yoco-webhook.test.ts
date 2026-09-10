import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyYocoWebhookSignature } from "@/lib/yoco-webhook";

describe("verifyYocoWebhookSignature", () => {
  it("accepts a valid Standard Webhooks v1 signature", () => {
    const secret = "whsec_" + Buffer.from("test-secret-key").toString("base64");
    const webhookId = "msg_123";
    const webhookTimestamp = "1700000000";
    const rawBody = JSON.stringify({ type: "payment.succeeded" });
    const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody}`;
    const key = Buffer.from("test-secret-key");
    const signature = createHmac("sha256", key)
      .update(signedPayload, "utf8")
      .digest("base64");

    expect(
      verifyYocoWebhookSignature({
        rawBody,
        webhookId,
        webhookTimestamp,
        webhookSignature: `v1,${signature}`,
        secret,
      })
    ).toBe(true);
  });

  it("rejects tampered payloads", () => {
    const secret = "whsec_" + Buffer.from("test-secret-key").toString("base64");
    const webhookId = "msg_123";
    const webhookTimestamp = "1700000000";
    const rawBody = JSON.stringify({ type: "payment.succeeded" });
    const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody}`;
    const key = Buffer.from("test-secret-key");
    const signature = createHmac("sha256", key)
      .update(signedPayload, "utf8")
      .digest("base64");

    expect(
      verifyYocoWebhookSignature({
        rawBody: JSON.stringify({ type: "payment.failed" }),
        webhookId,
        webhookTimestamp,
        webhookSignature: `v1,${signature}`,
        secret,
      })
    ).toBe(false);
  });
});
