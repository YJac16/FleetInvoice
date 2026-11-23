-- =============================================================================
-- 00073 — Fleet maintenance Drop 1, unit U1: schema + RLS
-- =============================================================================
-- Workshop bills are money OUT (what the fleet pays workshops). They are kept
-- fully separate from client invoices: no foreign keys to invoices,
-- invoice_lines or rate_cards, and nothing here changes those tables.
--
-- Numbered 00073 because 00071 and 00072 are already taken by open PRs
-- (#73, #74 and #76).
--
-- Access:
--   SELECT  platform owner, organisation_admin, manager (same organisation).
--   Drivers, employees, company_manager, dispatcher and supervisor see nothing.
--   INSERT / UPDATE / DELETE: no client policies. Writes go through audited
--   service-role RPCs, added in the next unit (same pattern as 00046/00047).
--
-- Money columns on bills and lines are filled by those RPCs (VAT is worked out
-- on the server). They default to 0 here.
--
-- Safe to apply on its own after 00070. The only change to an existing object
-- is widening module_entitlements_key_check to allow 'maintenance'. No plan is
-- given the module here.

-- ---------------------------------------------------------------------------
-- Module key
-- ---------------------------------------------------------------------------

alter table public.module_entitlements
  drop constraint if exists module_entitlements_key_check;
alter table public.module_entitlements
  add constraint module_entitlements_key_check check (
    module_key in (
      'core',
      'gps',
      'attendance',
      'billing',
      'payroll',
      'reports',
      'portal',
      'white_label',
      'sso',
      'integrations',
      'ai',
      'maintenance'
    )
  );

-- ---------------------------------------------------------------------------
-- maintenance_categories
-- ---------------------------------------------------------------------------

create table if not exists public.maintenance_categories (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint maintenance_categories_name_nonempty check (char_length(btrim(name)) > 0)
);

comment on table public.maintenance_categories is
  'Per-organisation categories for workshop bill lines (tyres, service, brakes, ...).';

create unique index if not exists maintenance_categories_org_name_uidx
  on public.maintenance_categories (organisation_id, lower(name))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- suppliers
-- ---------------------------------------------------------------------------

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  vat_number text,
  contact_phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint suppliers_name_nonempty check (char_length(btrim(name)) > 0)
);

comment on table public.suppliers is
  'Workshops and parts suppliers the fleet pays. Not clients; unrelated to companies.';

create unique index if not exists suppliers_org_name_uidx
  on public.suppliers (organisation_id, lower(name))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- workshop_bills
-- ---------------------------------------------------------------------------

create table if not exists public.workshop_bills (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  bill_date date not null,
  invoice_ref text not null,
  vat_mode text not null default 'exclusive',
  vat_rate numeric(5, 2) not null default 15.00,
  subtotal_excl numeric(14, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  total_incl numeric(14, 2) not null default 0,
  currency text not null default 'ZAR',
  status text not null default 'draft',
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  attachment_path text,
  attachment_mime text,
  attachment_size integer,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint workshop_bills_invoice_ref_nonempty check (char_length(btrim(invoice_ref)) > 0),
  constraint workshop_bills_vat_mode_check check (vat_mode in ('inclusive', 'exclusive')),
  constraint workshop_bills_vat_rate_check check (vat_rate >= 0 and vat_rate <= 100),
  constraint workshop_bills_amounts_nonneg check (
    subtotal_excl >= 0 and vat_amount >= 0 and total_incl >= 0
  ),
  constraint workshop_bills_total_check check (total_incl = subtotal_excl + vat_amount),
  constraint workshop_bills_currency_check check (currency = 'ZAR'),
  constraint workshop_bills_status_check check (status in ('draft', 'approved')),
  constraint workshop_bills_approved_check check (
    (status = 'approved' and approved_at is not null)
    or (status = 'draft' and approved_at is null and approved_by is null)
  ),
  constraint workshop_bills_attachment_all_or_none check (
    (attachment_path is null and attachment_mime is null and attachment_size is null)
    or (attachment_path is not null and attachment_mime is not null and attachment_size is not null)
  ),
  constraint workshop_bills_attachment_mime_check check (
    attachment_mime is null
    or attachment_mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
  ),
  constraint workshop_bills_attachment_size_check check (
    attachment_size is null or (attachment_size > 0 and attachment_size <= 10485760)
  )
);

comment on table public.workshop_bills is
  'Workshop bills (money OUT). Separate from client invoices. Writes via audited RPCs only.';
comment on column public.workshop_bills.vat_mode is
  'How line amounts were typed: inclusive (amounts include VAT) or exclusive.';
comment on column public.workshop_bills.attachment_path is
  'Object path in the private workshop-bills bucket. Viewed only through short-lived signed URLs.';

create index if not exists workshop_bills_org_date_idx
  on public.workshop_bills (organisation_id, bill_date desc)
  where deleted_at is null;
create index if not exists workshop_bills_org_status_idx
  on public.workshop_bills (organisation_id, status)
  where deleted_at is null;
create index if not exists workshop_bills_supplier_idx
  on public.workshop_bills (supplier_id);
create index if not exists workshop_bills_vehicle_idx
  on public.workshop_bills (vehicle_id);
create unique index if not exists workshop_bills_supplier_ref_uidx
  on public.workshop_bills (organisation_id, supplier_id, lower(btrim(invoice_ref)))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- workshop_bill_lines
-- ---------------------------------------------------------------------------

create table if not exists public.workshop_bill_lines (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.workshop_bills (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  category_id uuid references public.maintenance_categories (id) on delete set null,
  description text not null,
  quantity numeric(12, 3) not null default 1,
  unit_amount numeric(14, 2) not null default 0,
  vat_applicable boolean not null default true,
  line_excl numeric(14, 2) not null default 0,
  line_vat numeric(14, 2) not null default 0,
  line_incl numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workshop_bill_lines_description_nonempty check (char_length(btrim(description)) > 0),
  constraint workshop_bill_lines_quantity_pos check (quantity > 0),
  constraint workshop_bill_lines_amounts_nonneg check (
    unit_amount >= 0 and line_excl >= 0 and line_vat >= 0 and line_incl >= 0
  ),
  constraint workshop_bill_lines_total_check check (line_incl = line_excl + line_vat),
  constraint workshop_bill_lines_no_vat_check check (vat_applicable or line_vat = 0)
);

comment on table public.workshop_bill_lines is
  'Lines on a workshop bill. organisation_id is copied from the bill for RLS.';

create index if not exists workshop_bill_lines_bill_idx
  on public.workshop_bill_lines (bill_id, sort_order);
create index if not exists workshop_bill_lines_org_idx
  on public.workshop_bill_lines (organisation_id);
create index if not exists workshop_bill_lines_category_idx
  on public.workshop_bill_lines (category_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

drop trigger if exists maintenance_categories_set_updated_at on public.maintenance_categories;
create trigger maintenance_categories_set_updated_at
before update on public.maintenance_categories
for each row execute function public.set_updated_at();

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

drop trigger if exists workshop_bills_set_updated_at on public.workshop_bills;
create trigger workshop_bills_set_updated_at
before update on public.workshop_bills
for each row execute function public.set_updated_at();

drop trigger if exists workshop_bill_lines_set_updated_at on public.workshop_bill_lines;
create trigger workshop_bill_lines_set_updated_at
before update on public.workshop_bill_lines
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Same-organisation guards (a bill can't point at another org's rows)
-- ---------------------------------------------------------------------------

create or replace function public.guard_workshop_bill_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.suppliers s
    where s.id = new.supplier_id
      and s.organisation_id = new.organisation_id
  ) then
    raise exception 'supplier_org_mismatch';
  end if;

  if new.vehicle_id is not null and not exists (
    select 1 from public.vehicles v
    where v.id = new.vehicle_id
      and v.organisation_id = new.organisation_id
  ) then
    raise exception 'vehicle_org_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists workshop_bills_same_org on public.workshop_bills;
create trigger workshop_bills_same_org
before insert or update of organisation_id, supplier_id, vehicle_id on public.workshop_bills
for each row execute function public.guard_workshop_bill_same_org();

create or replace function public.guard_workshop_bill_line_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.workshop_bills b
    where b.id = new.bill_id
      and b.organisation_id = new.organisation_id
  ) then
    raise exception 'bill_org_mismatch';
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.maintenance_categories c
    where c.id = new.category_id
      and c.organisation_id = new.organisation_id
  ) then
    raise exception 'category_org_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists workshop_bill_lines_same_org on public.workshop_bill_lines;
create trigger workshop_bill_lines_same_org
before insert or update of organisation_id, bill_id, category_id on public.workshop_bill_lines
for each row execute function public.guard_workshop_bill_line_same_org();

revoke all on function public.guard_workshop_bill_same_org() from public, anon, authenticated;
revoke all on function public.guard_workshop_bill_line_same_org() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: read-only for org admins/managers; no client writes
-- ---------------------------------------------------------------------------

alter table public.maintenance_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.workshop_bills enable row level security;
alter table public.workshop_bill_lines enable row level security;

revoke all on table public.maintenance_categories from public, anon, authenticated;
revoke all on table public.suppliers from public, anon, authenticated;
revoke all on table public.workshop_bills from public, anon, authenticated;
revoke all on table public.workshop_bill_lines from public, anon, authenticated;

grant select on table public.maintenance_categories to authenticated;
grant select on table public.suppliers to authenticated;
grant select on table public.workshop_bills to authenticated;
grant select on table public.workshop_bill_lines to authenticated;

grant all on table public.maintenance_categories to service_role;
grant all on table public.suppliers to service_role;
grant all on table public.workshop_bills to service_role;
grant all on table public.workshop_bill_lines to service_role;

drop policy if exists maintenance_categories_select on public.maintenance_categories;
create policy maintenance_categories_select on public.maintenance_categories
  for select
  to authenticated
  using (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin', 'manager'])
  );

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select
  to authenticated
  using (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin', 'manager'])
  );

drop policy if exists workshop_bills_select on public.workshop_bills;
create policy workshop_bills_select on public.workshop_bills
  for select
  to authenticated
  using (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin', 'manager'])
  );

drop policy if exists workshop_bill_lines_select on public.workshop_bill_lines;
create policy workshop_bill_lines_select on public.workshop_bill_lines
  for select
  to authenticated
  using (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin', 'manager'])
  );

-- No insert/update/delete policies: with RLS enabled, client writes are denied
-- even if a broad table grant is added later.
