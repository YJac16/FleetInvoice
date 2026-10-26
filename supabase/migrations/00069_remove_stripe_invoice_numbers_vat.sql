-- 00069: Remove Stripe columns; add sequential invoice numbers and VAT.
--
-- Invoice numbers: allocated per organisation when an invoice first becomes
-- issued/paid (drafts get none), never reused, never changed once set.
-- Format: <prefix>-<5-digit sequence>, prefix from
-- organisations.settings->'invoice'->>'number_prefix' (default INV).
--
-- VAT: rate comes from organisations.settings->'invoice' when vat_registered
-- is true (vat_rate, default 15). It follows the org setting while the invoice
-- is a draft and is frozen once issued. total = subtotal + vat_amount.
-- A trigger does this so the existing invoice generation functions (which set
-- subtotal and total) need no changes.


-- 1. Stripe removed from the app.
drop index if exists public.subscriptions_stripe_customer_idx;
alter table public.subscriptions drop column if exists stripe_customer_id;
alter table public.subscriptions drop column if exists stripe_subscription_id;
alter table public.plans drop column if exists stripe_price_id;

-- 2. Customer VAT number (shown on tax invoices).
alter table public.companies add column if not exists vat_number text;

-- 3. Invoice number + VAT columns.
alter table public.invoices
  add column if not exists invoice_number text,
  add column if not exists invoice_seq integer,
  add column if not exists vat_rate numeric(5, 2) not null default 0,
  add column if not exists vat_amount numeric(14, 2) not null default 0;

alter table public.invoices
  drop constraint if exists invoices_vat_rate_check;
alter table public.invoices
  add constraint invoices_vat_rate_check check (vat_rate >= 0 and vat_rate <= 100);

create unique index if not exists invoices_org_seq_uidx
  on public.invoices (organisation_id, invoice_seq)
  where invoice_seq is not null;

-- 4. Per-organisation counter. Only the trigger (security definer) touches it.
create table if not exists public.invoice_number_counters (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  last_seq integer not null default 0
);
alter table public.invoice_number_counters enable row level security;
revoke all on public.invoice_number_counters from anon, authenticated;

-- 5. Helpers reading the org's invoice settings.
create or replace function public.invoice_org_vat_rate(p_org uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce((o.settings -> 'invoice' ->> 'vat_registered')::boolean, false)
      then least(100, greatest(0, coalesce(
        nullif(o.settings -> 'invoice' ->> 'vat_rate', '')::numeric, 15)))
    else 0
  end
  from public.organisations o
  where o.id = p_org;
$$;

create or replace function public.invoice_org_number_prefix(p_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(
      upper(regexp_replace(coalesce(o.settings -> 'invoice' ->> 'number_prefix', ''), '[^A-Za-z0-9]', '', 'g')),
      ''
    ),
    'INV'
  )
  from public.organisations o
  where o.id = p_org;
$$;

revoke all on function public.invoice_org_vat_rate(uuid) from public, anon;
revoke all on function public.invoice_org_number_prefix(uuid) from public, anon;
grant execute on function public.invoice_org_vat_rate(uuid) to authenticated, service_role;
grant execute on function public.invoice_org_number_prefix(uuid) to authenticated, service_role;

-- 6. Trigger: VAT + numbering.
create or replace function public.invoices_apply_vat_and_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seq integer;
begin
  -- VAT rate: follow org settings while draft; frozen after that.
  if tg_op = 'INSERT' or new.status = 'draft' or old.status = 'draft' then
    new.vat_rate := coalesce(public.invoice_org_vat_rate(new.organisation_id), 0);
  else
    new.vat_rate := old.vat_rate;
  end if;

  new.vat_amount := round(coalesce(new.subtotal, 0) * new.vat_rate / 100, 2);
  new.total := coalesce(new.subtotal, 0) + new.vat_amount;

  -- Number: never changes once set.
  if tg_op = 'UPDATE' and old.invoice_seq is not null then
    new.invoice_seq := old.invoice_seq;
    new.invoice_number := old.invoice_number;
  elsif new.invoice_seq is null and new.status in ('issued', 'paid') then
    insert into public.invoice_number_counters as c (organisation_id, last_seq)
    values (new.organisation_id, 1)
    on conflict (organisation_id)
      do update set last_seq = c.last_seq + 1
    returning c.last_seq into next_seq;

    new.invoice_seq := next_seq;
    new.invoice_number :=
      public.invoice_org_number_prefix(new.organisation_id) || '-' || lpad(next_seq::text, 5, '0');
  end if;

  return new;
end;
$$;

revoke all on function public.invoices_apply_vat_and_number() from public, anon, authenticated;

-- 7. Backfill numbers for invoices that were already issued (incl. later voided/paid),
--    in issue order per organisation. Existing totals are left as they are (VAT 0).
with numbered as (
  select
    i.id,
    i.organisation_id,
    row_number() over (
      partition by i.organisation_id
      order by coalesce(i.issued_at, i.created_at), i.created_at, i.id
    ) as seq
  from public.invoices i
  where i.invoice_seq is null
    and (i.status in ('issued', 'paid') or i.issued_at is not null)
)
update public.invoices i
set invoice_seq = n.seq,
    invoice_number = public.invoice_org_number_prefix(n.organisation_id) || '-' || lpad(n.seq::text, 5, '0')
from numbered n
where i.id = n.id;

insert into public.invoice_number_counters (organisation_id, last_seq)
select organisation_id, max(invoice_seq)
from public.invoices
where invoice_seq is not null
group by organisation_id
on conflict (organisation_id) do update
  set last_seq = greatest(public.invoice_number_counters.last_seq, excluded.last_seq);

-- Trigger created after the backfill so legacy totals are not recalculated.
drop trigger if exists invoices_apply_vat_and_number on public.invoices;
create trigger invoices_apply_vat_and_number
before insert or update on public.invoices
for each row execute function public.invoices_apply_vat_and_number();

