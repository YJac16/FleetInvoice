-- Phase 8 RLS / presence stubs (run after 00010 + 00011)
-- Rate cards, period invoices, paid status

select 'table' as kind, c.relname as name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('rate_cards', 'invoices', 'invoice_lines')
union all
select 'function', p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'generate_period_invoice',
    'set_invoice_status',
    'generate_weekly_fuel_invoice'
  )
union all
select 'column', 'invoices.paid_at'
from information_schema.columns
where table_schema = 'public'
  and table_name = 'invoices'
  and column_name = 'paid_at'
union all
select 'enum_label', e.enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname in ('invoice_status', 'invoice_line_type', 'rate_card_unit')
order by 1, 2;

-- Manual scenarios:
-- 1) Ops create rate_card trip/fixed → insert succeeds
-- 2) company_manager create rate_card → denied
-- 3) generate_period_invoice with fuel + trip rate + completed trips → issued lines
-- 4) Second generate same period → returns existing (idempotent)
-- 5) set_invoice_status issued → paid → paid_at set
-- 6) set_invoice_status paid → void → exception
-- 7) company_manager mark paid for scoped company → ok; unscoped → Not authorised
