# ADR 0013 — Phase 9a Subscriptions & Module Entitlements

## Status

Accepted — 2026-07-27

## Context

WorkOps needs self-serve SaaS packaging: attach a plan to an organisation and hide locked commercial modules in navigation. Invite-only signup remains the default.

## Decision

1. Migration `00013_phase9_subscriptions.sql`: `plans`, `module_entitlements`, `subscriptions`, RPC `org_entitled_modules`.
2. Seed `starter` (all modules) and `growth` (no payroll); grandfather existing orgs onto `starter`.
3. Nav items carry a `module`; sidebar filters by `listEntitledModules` (fail-open to all modules if RPC missing).
4. Platform UI at `/subscriptions` for plan assign; optional Stripe Checkout / Customer Portal / webhook when Stripe keys and `stripe_price_id` are set.
5. Keep invite-only auth — billing is not open self-registration.

## Consequences

- Apply `00013` on the WorkOps Supabase project before relying on gating.
- Apply `00016_membership_three_tiers.sql` for ZAR vehicle-based Starter / Growth / Scale pricing. The live project already has `membership_three_tiers`; the repo file is an idempotent equivalent.
- `/subscriptions` is the signed-in membership page (not a public marketing landing).
- Next: Phase 9b company portal polish; Phase 9c white-label.
