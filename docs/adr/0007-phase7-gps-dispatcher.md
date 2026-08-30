# ADR 0007 — Phase 7 Live GPS, Mapbox Dispatcher Board & Radius Geofences

## Status

Accepted — 2026-07-23

## Context

Phases 4–6 delivered trip execution, fuel, hubs, and attendance. Dispatchers still lack live location and a ops board. Architecture Phase 7 is XL; this ADR scopes an MVP: ingest, last-known positions, Mapbox board + trip kanban, and circular geofences. Monthly partitioning, polygon fences, and full Realtime fan-out are deferred.

## Decision

1. Migration `00009_phase7_gps_and_dispatch.sql`.
2. Append-only `gps_points` with btree `(organisation_id, recorded_at)`; hot read model `gps_last_positions` upserted per driver on ingest.
3. Batch ingest via security-definer `ingest_gps_points`; thin optional `POST /api/gps/ingest` for future partners; driver portal uses browser geolocation → RPC.
4. Circular `geofences` (center + radius_m); `geofence_events` for enter/exit; checks run inside ingest RPC; optional outbox notify.
5. Mapbox GL JS behind `lib/maps/` adapter; `NEXT_PUBLIC_MAPBOX_TOKEN` for client maps.
6. Dashboard `/dispatch` (map + trip status columns); geofences CRUD under ops; permissions `gps:publish`, `gps:view`, `dispatch:view`.
7. Poll last-known every ~10s for MVP (Realtime subscribe later).

## Consequences

- Drivers must be linked via `drivers.profile_id` to publish GPS.
- GPS volume grows unbounded until a retention/partition job exists — document BRIN/partition plan; do not block MVP.
- Apply `00009` only after `00008`.
- Phase 8 (billing/payroll) remains next after this MVP ships in app.
