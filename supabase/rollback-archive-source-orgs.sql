-- =============================================================================
-- ROLLBACK: supabase/archive-source-orgs-jacobs.sql (manual script)
-- =============================================================================
-- Restores the source orgs of the jacobs-org copy batch (override slug with
-- app.jacobs_target_slug) to status 'active' / deleted_at null, and the
-- memberships the archive suspended (same deleted_at as their org) to
-- status 'active' / deleted_at null. No other rows change.
-- =============================================================================

begin;

do $rb$
declare
  v_slug text := coalesce(nullif(current_setting('app.jacobs_target_slug', true), ''), 'jacobs-org');
  v_target uuid;
  v_sources uuid[];
  o record;
begin
  select id into v_target from public.organisations where slug = v_slug;
  if v_target is null then
    raise exception 'rollback-archive: no org with slug %', v_slug;
  end if;

  select array_agg(distinct m.source_org_id) into v_sources
  from public.org_copy_map m
  where m.source_table = 'organisations' and m.new_id = v_target;
  if v_sources is null then
    raise exception 'rollback-archive: % has no org_copy_map batch', v_slug;
  end if;

  for o in
    select id, deleted_at from public.organisations
    where id = any (v_sources) and deleted_at is not null
  loop
    update public.organisation_members
    set status = 'active', deleted_at = null
    where organisation_id = o.id and status = 'suspended' and deleted_at = o.deleted_at;

    update public.organisations
    set status = 'active', deleted_at = null
    where id = o.id;
  end loop;
end;
$rb$;

commit;
