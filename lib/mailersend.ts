type MailerSendFrom = {
  email: string;
  name?: string;
};

export function parseMailerSendFrom(raw: string): MailerSendFrom {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: trimmed };
}

export async function sendTransactionalEmail(input: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const from = parseMailerSendFrom(input.from);

  const response = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [{ email: input.to }],
      subject: input.subject,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MailerSend failed: ${response.status} ${text}`);
  }
}
