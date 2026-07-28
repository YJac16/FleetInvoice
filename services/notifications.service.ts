import { createClient } from "@/lib/supabase/client";

export type EnqueueNotificationInput = {
  organisationId: string | null;
  channel?: "email" | "sms" | "push";
  recipient: string;
  subject: string;
  body: string;
  templateKey?: string;
  payload?: Record<string, unknown>;
};

export async function enqueueNotification(
  input: EnqueueNotificationInput
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("enqueue_notification", {
    p_organisation_id: input.organisationId,
    p_channel: input.channel ?? "email",
    p_recipient: input.recipient,
    p_subject: input.subject,
    p_body: input.body,
    p_template_key: input.templateKey ?? null,
    p_payload: input.payload ?? {},
  });
  if (error) throw error;
  return data as string;
}
