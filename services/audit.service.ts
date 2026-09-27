export type AuditWriteInput = {
  organisationId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(input: AuditWriteInput): Promise<string> {
  const res = await fetch("/api/audit/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organisationId: input.organisationId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
    }),
  });
  if (!res.ok) {
    throw new Error(`audit_write_failed:${res.status}`);
  }
  const payload = (await res.json()) as { id?: string };
  return payload.id ?? "";
}
