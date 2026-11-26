# GO.md

Demo only. Minimal; mobile-first 390 then 1440. No main/fyx/tggx/prod, rate cards, invoice or trip pricing. Drivers never see prices. No invented rates or thresholds. Don't apply migrations.

1. Last paid: bill form shows "Last paid R… on date, supplier" per category (Final bills; same vehicle first, else org, else "No past bill"). Prefill unit amount, editable.
2. Due forecast: migration 00098_maintenance_intervals.sql (org+category, nullable interval_km/interval_months, admin write, RLS) + supabase/rollback-00098.sql. Tab Maintenance > Due: per vehicle+category with an interval, next due from last Final bill (odometer_km, bill_date). Date from months, or km/day only if 2+ readings, 30+ days, 1,000+ km apart. Label every due km, date and cost "Estimate". Cost = last paid. Manager sees due only, no rand.
3. Worth keeping: /maintenance/vehicles, organisation_admin and platform owner only (others 404, no tab). Period (default 3 months), owner All/Yaseen/Fadia. Per vehicle: invoiced revenue (non-void invoice_lines.trip_id to trips.vehicle_id), Final bills incl VAT, priced fuel total_amount, contribution. Review if contribution < 0, or revenue 0 and cost > 0; No activity if both 0; else Keep. Note: fixed costs not included. Service client after role guard.

Files: features/maintenance, app/(dashboard)/maintenance, lib/auth/maintenance-access.ts. Dashboard link and fuel lock (00093-95) stay as is.

Tests: last-paid, forecast gates, admin-only, Keep/Review.

Run lint, tsc, npm test. Delete GO.md. Open ONE draft PR into demo titled "Maintenance finish (demo only)". No merge.
