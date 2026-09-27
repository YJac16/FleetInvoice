/**
 * Client-originated audit events (browser → /api/audit/log). Fleet/compliance RPCs log separately.
 *
 * Migration 00048: `write_audit_log` branches on `session_user`, but PostgREST always connects as
 * `authenticator`, so those branches never run for HTTP RPC calls. Protection is the REVOKE that
 * limits EXECUTE to `service_role` (see 00048_audit_log_hardening_compliance_purge.sql).
 */
export const CLIENT_AUDIT_ENTITY_BY_ACTION: Readonly<Record<string, readonly string[]>> = {
  "employees.imported": ["employee"],
  "member.role_updated": ["organisation_member"],
  "member.suspended": ["organisation_member"],
  "member.activated": ["organisation_member"],
  "invitation.created": ["invitation"],
  "invitation.revoked": ["invitation"],
  "vehicle_document.created": ["vehicle_document"],
  "organisation.created": ["organisation"],
  "organisation.updated": ["organisation"],
  "organisation.deleted": ["organisation"],
  "member_scope.added": ["member_scope"],
  "member_scope.removed": ["member_scope"],
};

export function isClientAuditEventAllowed(action: string, entityType: string): boolean {
  const allowed = CLIENT_AUDIT_ENTITY_BY_ACTION[action];
  return allowed !== undefined && allowed.includes(entityType);
}

export const MAX_CLIENT_AUDIT_BODY_BYTES = 8_192;
export const MAX_CLIENT_AUDIT_METADATA_BYTES = 4_096;
