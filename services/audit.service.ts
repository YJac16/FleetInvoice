"use server";

import { pushDemoAudit } from "@/lib/pricing/demo-store";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/supabase/server";

export async function writeAuditLog(input: {
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!hasSupabaseConfig()) {
    pushDemoAudit(input);
    return;
  }

  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      user_id: input.userId,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? {},
    } as never);
  } catch (error) {
    console.error("writeAuditLog:", error);
  }
}
