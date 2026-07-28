# WorkOps documentation

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Master software architecture & phased roadmap |
| [adr/0002-phase2-master-data.md](./adr/0002-phase2-master-data.md) | Phase 2 master data decisions |
| [adr/0005-phase5-fuel-hubs-invoices.md](./adr/0005-phase5-fuel-hubs-invoices.md) | Phase 5 fuel, hubs & weekly invoices |
| [adr/0006-phase6-employee-qr-attendance.md](./adr/0006-phase6-employee-qr-attendance.md) | Phase 6 employee portal, QR & attendance |
| [adr/0007-phase7-gps-dispatcher.md](./adr/0007-phase7-gps-dispatcher.md) | Phase 7 GPS ingest, Mapbox board & geofences |
| [adr/0008-phase8-billing.md](./adr/0008-phase8-billing.md) | Phase 8 rate cards & invoice lifecycle |
| [adr/0009-phase8-payroll.md](./adr/0009-phase8-payroll.md) | Phase 8 payroll runs from trips & attendance |
| [adr/0010-phase8-reports.md](./adr/0010-phase8-reports.md) | Phase 8 operational reports & CSV exports |
| [adr/0011-p0-production-hardening.md](./adr/0011-p0-production-hardening.md) | P0 env check, outbox cron, smoke/RLS gates |
| [adr/0012-p1-invoice-print.md](./adr/0012-p1-invoice-print.md) | P1 invoice HTML print / browser PDF |
| [adr/0013-phase9-subscriptions.md](./adr/0013-phase9-subscriptions.md) | Phase 9a plans, entitlements, Stripe |
| [adr/0014-phase9-white-label.md](./adr/0014-phase9-white-label.md) | Phase 9c white-label hostnames |
| [runbooks/env-checklist.md](./runbooks/env-checklist.md) | Environment & secrets checklist (incl. P0 retail) |
| [runbooks/notifications-cron.md](./runbooks/notifications-cron.md) | Outbox drain / cron for production |
| [runbooks/retail-go-live.md](./runbooks/retail-go-live.md) | Wave 0 operator checklist before retail sell |
| [runbooks/vercel-deploy.md](./runbooks/vercel-deploy.md) | First-time WorkOps Vercel project (not UniCab) |
| [runbooks/white-label-domains.md](./runbooks/white-label-domains.md) | Custom domain DNS + Vercel attach |

Implementation work should cite phase IDs and entity names from `ARCHITECTURE.md` before writing SQL or UI.
