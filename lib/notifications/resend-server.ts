import { env } from "@/lib/env";

export async function sendResendEmail(input: {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL ?? "WorkOps <onboarding@resend.dev>";
  if (!apiKey) {
    throw new Error(
      "Email delivery is not configured. Set RESEND_API_KEY to send invoices."
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      cc: input.cc?.length ? input.cc : undefined,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email send failed (${response.status}): ${body}`);
  }
}
