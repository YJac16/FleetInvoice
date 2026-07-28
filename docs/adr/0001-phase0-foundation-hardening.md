# ADR 0001 — Phase 0 Foundation Hardening

## Status

Accepted — 2026-07-22

## Context

WorkOps Foundation v1 (invite-only auth, multi-tenant master data, RBAC) is shipped. Before routes/trips/GPS, the platform needs commercially safe hardening: auditability, extended roles (Supervisor, Company Manager), invitation delivery, and an RLS test harness.

## Decision

1. **Forward-only migration** `00002_phase0_hardening.sql` adds enum values, `member_scopes`, `audit_logs`, and `notification_outbox` without editing `00001`.
2. **Supervisor** is an org ops role with view + limited manage (attendance/exceptions later; Phase 0 grants ops view + soft master-data manage aligned to dispatcher minus user admin).
3. **Company Manager** is ABAC via `member_scopes.company_id`, enforced by `has_company_scope()` and tightened SELECT on `companies` / `employees`.
4. **Audit logs** are append-only; writers use a security-definer `write_audit_log` RPC; clients cannot update/delete.
5. **Invitation emails** enqueue to `notification_outbox` and are processed by `/api/notifications/process` (Resend when configured; otherwise marked `skipped` with payload retained for ops).
6. **Architecture blueprint** lives in `docs/ARCHITECTURE.md` and is the master roadmap reference.

## Consequences

- New roles must stay in sync across Postgres enum, `lib/constants.ts`, and `lib/permissions`.
- Company Manager without scopes sees no company/employee rows (fail closed).
- Email delivery is best-effort until a provider key is set; invites still work via copied URL.
- RLS tests in `tests/rls/` must be run against a Supabase/Postgres instance before Phase 3.
