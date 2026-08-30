import { createClient } from "@/lib/supabase/client";

export type AuditWriteInput = {
  organisationId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(input: AuditWriteInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("write_audit_log", {
    p_organisation_id: input.organisationId,
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw error;
  return data as string;
}
