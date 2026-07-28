# ADR 0011 — P0 Production Hardening

## Status

Accepted — 2026-07-24 (tooling shipped; live secrets/cron remain operator actions)

## Context

Phases 0–8 ops core are implemented. Before managed retail deploy, go-live must be repeatable: env validation, notification outbox drain, `vehicle-docs` bucket readiness, and a minimal smoke/RLS gate. Full SaaS packaging (subscriptions) stays Phase 9 / P2.

## Decision

1. Add `npm run env:check` (`scripts/check-env.mjs`) — fail on missing required public/app vars; warn on empty service role, Resend, Mapbox, and localhost `NEXT_PUBLIC_APP_URL`.
2. Strengthen `npm run db:audit` for P0 secrets and `vehicle-docs` bucket create when service role is present.
3. Document and script outbox drain: `npm run notifications:drain` + [`docs/runbooks/notifications-cron.md`](../runbooks/notifications-cron.md); Auth URL notes cover production hostname.
4. Minimal Playwright smoke (`e2e/smoke.spec.ts`, `@smoke`) — unauthenticated `/login` loads; optional auth flow when `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` are set. No full DB CI runner in this slice; `tests/rls/` SQL remains the schema/RLS gate.
5. Secrets (`SUPABASE_SERVICE_ROLE_KEY`, Resend, Mapbox) stay manual paste by the operator — tooling does not invent them.

## Consequences

- Retail managed deploy is unblocked once operators paste secrets, schedule cron, and run the P0 checklist in [`env-checklist.md`](../runbooks/env-checklist.md).
- Next product slices: P1 billing polish (invoice PDF/print) or Phase 9 subscriptions for self-serve SaaS.
