# FleetInvoice

Transport management SaaS for companies where drivers submit trips and the office generates invoices.

**Phase 1** delivers the application foundation only: authentication, roles, database schema, layouts, navigation, and placeholder modules. Trip logging, pricing, invoice generation, and PDFs are intentionally out of scope.

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

Apply the SQL migration in the Supabase SQL editor (or via Supabase CLI):

```bash
# SQL file
supabase/migrations/00001_initial_schema.sql
```

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

## Phase 1 checklist

- [x] Next.js 15 foundation
- [x] Supabase clients + auth (login, forgot password, remember me, logout)
- [x] Role-based middleware
- [x] SQL schema, indexes, FKs, RLS
- [x] App shell (sidebar, top nav, mobile menu, profile menu, dark mode)
- [x] Placeholder pages for all modules
- [x] Shared UI (table, modal, confirm, empty state, pagination, skeletons)
- [x] Global error boundary, 404, loading states, toasts
