# WorkOps

Enterprise multi-tenant **Workforce Operations Platform**.

Transport is the first industry module. Foundation v1 + Phase 0 hardening deliver authentication, organisations, roles (including Supervisor and Company Manager), invitations with email outbox, audit logging, and core master-data management.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Auth, PostgreSQL, RLS, Storage-ready, Realtime-ready)
- React Hook Form + Zod
- TanStack Query

## Architecture

Master blueprint: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

```text
app/            route entrypoints (+ api/ for privileged jobs)
components/     shared UI + layout
features/       isolated feature modules
services/       data access layer
lib/            env, auth, permissions, supabase, notifications
hooks/          shared React hooks
types/          domain types
utils/          pure helpers
database/       seeds and diagnostics (non-prod)
supabase/       SQL migrations (canonical; applied with the Supabase CLI)
docs/           architecture, ADRs, runbooks
tests/          unit + RLS harness
```

## Access model

**Invite-only.** There is no public signup.

1. Create a user in Supabase Auth
2. Promote that user to Platform Owner (see seed below)
3. Platform Owner creates organisations and invites Organisation Admins
4. Organisation Admins invite Manager / Dispatcher / Supervisor / Company Manager / Driver / Employee users
5. Assign **company scopes** for Company Managers (Users → Scopes)

## Getting started

1. Install dependencies

```bash
npm install
```

2. Configure environment

```bash
cp .env.example .env.local
```

See [`docs/runbooks/env-checklist.md`](docs/runbooks/env-checklist.md).

3. Apply database migrations to your Supabase project with the CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

All migrations live in `supabase/migrations/` and run in filename order.
Numbers 00028, 00053, 00054 and 00056 are intentionally unused (dropped
during review); nothing is missing.

4. Create Storage bucket `vehicle-docs` (see env checklist) for vehicle document uploads.

5. Bootstrap a platform owner

```sql
update public.profiles
set is_platform_owner = true
where email = 'you@example.com';
```

6. (Optional) Load Cape Shuttle Ops demo data for screenshots

Create an Auth user `admin@cape-shuttle.example`, then run [`database/seed.demo.cape-shuttle.sql`](database/seed.demo.cape-shuttle.sql) in the SQL editor. Matching TypeScript fixtures: [`tests/fixtures/cape-shuttle-ops.ts`](tests/fixtures/cape-shuttle-ops.ts).

After seeding, open `/dashboard`, `/areas`, `/vehicles`, `/trips`, `/fuel`, and `/invoices`.

7. Start the app

```bash
npm run dev
```

8. Run unit tests

```bash
npm test
```

## Roles

| Role | Typical access |
|------|----------------|
| Platform Owner | All organisations, invites org admins |
| Organisation Admin | Users + all master data in their org |
| Manager / Dispatcher / Supervisor | Ops master-data (supervisor: limited manage + attendance) |
| Company Manager | Scoped client companies/employees only |
| Driver / Employee | Limited view (dashboard, profile) |

## Notifications

Creating an invitation enqueues an email on `notification_outbox`. Drain with:

```bash
curl -X POST http://localhost:3000/api/notifications/process \
  -H "Authorization: Bearer $NOTIFICATIONS_PROCESS_SECRET"
```

## Future modules

See the phased roadmap in `docs/ARCHITECTURE.md` (routes, trips, QR, GPS, billing, AI).
