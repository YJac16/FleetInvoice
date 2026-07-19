# FleetInvoice

Transport management SaaS for companies where drivers submit trips and the office generates invoices.

**Phase 1** delivered the application foundation (auth, roles, schema, layouts).

**Phase 2** delivered the **Driver Portal**: trip capture, my trips, edit/delete, duplicate detection, draft autosave.

**Phase 3** delivers the **Pricing Engine**: server-side price calculation, admin pricing rules, price preview, overrides, and locked prices on approval. Drivers never see prices.

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Auth, PostgreSQL, RLS)
- React Hook Form + Zod
- TanStack Table + React Query
- Day.js + Lucide Icons

## Getting started

```bash
npm install
cp .env.example .env.local
```

Fill in Supabase values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Apply SQL migrations in order in the Supabase SQL editor (or via Supabase CLI):

```bash
supabase/migrations/00001_initial_schema.sql
supabase/migrations/00002_driver_trips.sql
supabase/migrations/00003_pricing_engine.sql
```

Create Auth users, ensure matching `profiles` + `drivers` rows, then seed active companies/vehicles for dropdowns.

Then run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> Without Supabase env vars the UI still builds. The default demo session is a **driver**. Set `NEXT_PUBLIC_DEMO_ROLE=admin` to review Pricing Rules and admin trip pricing. Admin-only routes also use an admin demo session automatically.

## Roles

| Role   | Access |
|--------|--------|
| Admin  | All modules, pricing rules, trip prices, overrides |
| Driver | Dashboard, Trips (no prices), Settings only |

Roles live on `profiles.role`. Middleware blocks drivers from admin routes. Postgres RLS enforces the same boundaries (drivers cannot query `pricing_rules`, `pricing_history`, or see prices via driver RPCs).

## Pricing Engine (Phase 3)

- Prices are calculated **only on the server** (Postgres triggers + server actions).
- Match order: company → pickup → destination → areas visited → passenger range → vehicle → highest priority.
- Pending/rejected trip edits recalculate automatically.
- Approving a trip sets `price_locked = true` (never recalculates afterward).
- Missing rule → trip still saves with `pricing_status = needs_pricing` (admin warning only).
- Manual overrides require a reason and write `pricing_history` + audit logs.
- Soft-delete pricing rules (`active = false`); hard deletes are blocked.

## Project structure

```
app/            App Router pages, layouts, auth callback
components/     UI primitives + layout + shared components
features/       Feature-scoped UI (auth, trips, pricing)
hooks/          Client hooks
lib/            Constants, navigation, pricing engine, demo stores
services/       Server-side services (auth, trips, pricing, admin trips)
types/          Shared TypeScript types
utils/          Date/format/currency helpers
supabase/       Clients + SQL migrations
```

## Scripts

```bash
npm run dev      # development server
npm run build    # production build
npm run start    # start production server
npm run lint     # eslint
```

## Phase checklist

### Phase 1
- [x] Next.js 15 foundation, auth, roles, schema, app shell, placeholders

### Phase 2 — Driver Portal
- [x] Driver dashboard (today / week / pending / approved + recent / upcoming)
- [x] Multi-step New Trip form (no pricing)
- [x] Save trips to Supabase with RLS (own trips only)
- [x] My Trips table + timeline views, search + filters
- [x] Edit pending/rejected; delete pending with confirm
- [x] Duplicate detection warning
- [x] Draft autosave every 15s + restore
- [x] Toast notifications; mobile sticky submit

### Phase 3 — Pricing Engine
- [x] Expanded `pricing_rules` + trip price columns + `pricing_history`
- [x] Server-side match engine + DB triggers / RPCs
- [x] Auto-calculate on create/update; lock on approve
- [x] Admin Pricing Rules CRUD (soft delete) + price preview
- [x] Admin trip list/detail with price badges + manual override
- [x] Audit log entries for pricing events
- [x] Drivers cannot access pricing data

### Later
- [ ] Invoice generation + PDFs
- [ ] Reports
