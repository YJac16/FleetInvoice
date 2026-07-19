# FleetInvoice

Transport management SaaS for companies where drivers submit trips and the office generates invoices.

**Phase 1** delivered the application foundation (auth, roles, schema, layouts).

**Phase 2** delivers the **Driver Portal**: trip capture, my trips (table + timeline), edit/delete pending trips, duplicate detection, and draft autosave. Pricing, invoices, reports, PDFs, and admin review remain out of scope.

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
```

Create Auth users, ensure matching `profiles` + `drivers` rows, then seed active companies/vehicles for dropdowns.

Then run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> Without Supabase env vars the UI still builds. Dashboard pages use a local demo admin session so the shell can be reviewed. Auth actions require real credentials.

## Roles

| Role   | Access |
|--------|--------|
| Admin  | All modules |
| Driver | Dashboard, Trips, Settings only |

Roles live on `profiles.role`. Middleware blocks drivers from admin routes. Postgres RLS enforces the same boundaries at the data layer (drivers cannot view invoices or pricing rules).

## Project structure

```
app/            App Router pages, layouts, auth callback
components/     UI primitives + layout + shared components
features/       Feature-scoped UI (auth forms, etc.)
hooks/          Client hooks
lib/            Constants, navigation, env helpers
services/       Server-side auth/profile services
types/          Shared TypeScript types
utils/          Date/format helpers
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

### Later
- [ ] Pricing rules engine
- [ ] Invoice generation + PDFs
- [ ] Admin trip review workflow
