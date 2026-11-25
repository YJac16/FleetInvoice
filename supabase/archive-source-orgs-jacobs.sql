-- =============================================================================
-- ARCHIVE the source orgs of the Jacobs Org copy (NOT a migration — run by
-- hand only, after Product QA signs off the copy).
-- =============================================================================
-- 1. Finds the copy batch for slug jacobs-org (override with
--    app.jacobs_target_slug) and its source orgs from org_copy_map.
-- 2. Reconciles source vs target before touching anything; any mismatch
--    raises and nothing changes:
--      trips / trip_assignments / trip_billing_overrides / invoices /
--      invoice_lines counts; invoice subtotal + total; line amounts;
--      price_overridden line count; manual trip prices;
--      every source invoice mapped 1:1 to a distinct target invoice;
--      0 invoice_lines whose unit_price / amount / price_overridden /
--      override_reason differ from their source line;
--      target has an active growth subscription.
-- 3. Archives (no hard delete): source organisations status 'inactive' +
--    deleted_at; their organisation_members status 'suspended' + deleted_at
--    (the same timestamp, which rollback-archive-source-orgs.sql uses to
--    restore exactly these rows).
-- Undo: supabase/rollback-archive-source-orgs.sql
-- =============================================================================

begin;

do $arch$
declare
  v_slug text := coalesce(nullif(current_setting('app.jacobs_target_slug', true), ''), 'jacobs-org');
  v_target uuid;
  v_batch uuid;
  v_sources uuid[];
  v_now timestamptz := timezone('utc', now());
  c record;
  v_src numeric;
  v_dst numeric;
  v_bad bigint;
begin
  select id into v_target from public.organisations where slug = v_slug and deleted_at is null;
  if v_target is null then
    raise exception 'archive: no active org with slug %', v_slug;
  end if;

  select m.batch_id into v_batch
  from public.org_copy_map m
  where m.source_table = 'organisations' and m.new_id = v_target
  order by m.created_at desc
  limit 1;
  if v_batch is null then
    raise exception 'archive: % has no org_copy_map batch', v_slug;
  end if;

  select array_agg(m.source_org_id order by m.created_at) into v_sources
  from public.org_copy_map m
  where m.batch_id = v_batch and m.source_table = 'organisations';

  if 'a1000000-0000-4000-8000-000000000001' = any (v_sources) then
    raise exception 'archive: refusing to archive Cape Shuttle Ops';
  end if;

  for c in
    select * from (values
      ('trips', 'count(*)'),
      ('trip_assignments', 'count(*)'),
      ('trip_billing_overrides', 'count(*)'),
      ('invoices', 'count(*)'),
      ('invoices', 'coalesce(sum(total), 0)'),
      ('invoices', 'coalesce(sum(subtotal), 0)'),
      ('invoice_lines', 'count(*)'),
      ('invoice_lines', 'coalesce(sum(amount), 0)'),
      ('invoice_lines', 'count(*) filter (where price_overridden)'),
      ('trips', 'coalesce(sum(manual_unit_price), 0)')
    ) as t(tbl, agg)
  loop
    execute format('select %s from public.%I where organisation_id = any ($1)', c.agg, c.tbl) into v_src using v_sources;
    execute format('select %s from public.%I where organisation_id = $1', c.agg, c.tbl) into v_dst using v_target;
    if v_src is distinct from v_dst then
      raise exception 'archive: reconciliation failed for % % (source %, target %)', c.tbl, c.agg, v_src, v_dst;
    end if;
  end loop;

  select count(*) into v_bad
  from public.invoices i
  left join public.org_copy_map m
    on m.batch_id = v_batch and m.source_table = 'invoices' and m.source_id = i.id
  left join public.invoices t on t.id = m.new_id and t.organisation_id = v_target
  where i.organisation_id = any (v_sources)
    and (t.id is null or t.total <> i.total or t.status <> i.status
         or t.deleted_at is distinct from i.deleted_at);
  if v_bad > 0 or (
    select count(distinct m.new_id) from public.org_copy_map m
    where m.batch_id = v_batch and m.source_table = 'invoices'
  ) <> (select count(*) from public.invoices where organisation_id = any (v_sources)) then
    raise exception 'archive: invoice identity map is not 1:1 (% bad)', v_bad;
  end if;

  select count(*) into v_bad
  from public.invoice_lines l
  join public.org_copy_map m
    on m.batch_id = v_batch and m.source_table = 'invoice_lines' and m.source_id = l.id
  join public.invoice_lines t on t.id = m.new_id
  where l.organisation_id = any (v_sources)
    and (t.unit_price <> l.unit_price or t.amount <> l.amount or t.quantity <> l.quantity
         or t.price_overridden <> l.price_overridden
         or t.override_reason is distinct from l.override_reason);
  if v_bad > 0 then
    raise exception 'archive: % invoice line price mismatches', v_bad;
  end if;

  if not exists (
    select 1 from public.subscriptions s join public.plans p on p.id = s.plan_id
    where s.organisation_id = v_target and s.status = 'active' and p.code = 'growth'
  ) then
    raise exception 'archive: target has no active growth subscription';
  end if;

  update public.organisation_members
  set status = 'suspended', deleted_at = v_now
  where organisation_id = any (v_sources) and deleted_at is null;

  update public.organisations
  set status = 'inactive', deleted_at = v_now
  where id = any (v_sources) and deleted_at is null;

  raise notice 'archive: archived source orgs % (batch %)', v_sources, v_batch;
end;
$arch$;

commit;
