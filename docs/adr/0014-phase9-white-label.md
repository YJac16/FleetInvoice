# ADR 0014 — Phase 9c White-label Hostnames

## Status

Accepted — 2026-07-27

## Context

Retail multi-brand needs custom domains themed per organisation without a parallel codebase.

## Decision

1. Migration `00014_phase9_white_label.sql`: `white_label_configs` + `lookup_white_label(hostname)`.
2. Middleware resolves non-localhost hosts and sets `workops_wl` cookie; `WhiteLabelTheme` applies CSS variables.
3. Platform CRUD at `/white-label` (platform owner).
4. DNS/Vercel domain attach documented in [`docs/runbooks/white-label-domains.md`](../runbooks/white-label-domains.md).

## Consequences

- Apply `00014` on WorkOps Supabase before custom hosts work.
- Auth redirect allow-list must include each custom hostname.
