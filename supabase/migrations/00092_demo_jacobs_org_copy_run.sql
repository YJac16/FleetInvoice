-- =============================================================================
-- 00092: DEMO ONLY — copy Demo Yaseen Org + Demo Fadia Org into "Jacobs Org"
--   (slug jacobs-org) with copy_orgs_to_jacobs_org (00091).
--
--   Same guard as 00090: runs only where the Cape Shuttle Ops demo org
--   exists (goops-demo) or on the local test DB; a no-op elsewhere, and a
--   no-op when jacobs-org already exists or the source orgs are missing.
--   Source orgs are left exactly as they were (archiving them is the
--   separate, manual supabase/archive-source-orgs-jacobs.sql).
--   Batch id is fixed so the run is traceable in org_copy_map.
-- Undo: supabase/rollback-jacobs-org-copy.sql
-- =============================================================================

do $run$
declare
  v_target uuid;
begin
  if not (
    exists (select 1 from public.organisations where id = 'a1000000-0000-4000-8000-000000000001')
    or current_database() = 'workops_audit'
  ) then
    raise notice '00092: not the goops-demo / local test database; Jacobs Org copy skipped';
    return;
  end if;
  if exists (select 1 from public.organisations where slug = 'jacobs-org') then
    raise notice '00092: jacobs-org already exists; copy skipped';
    return;
  end if;
  if (
    select count(*) from public.organisations
    where id in ('5eed0000-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000002')
      and deleted_at is null
  ) <> 2 then
    raise notice '00092: Demo Yaseen / Fadia source orgs not present; copy skipped';
    return;
  end if;

  v_target := public.copy_orgs_to_jacobs_org(
    array['5eed0000-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000002']::uuid[],
    'Jacobs Org',
    'jacobs-org',
    '5eed0000-0000-4000-8000-00000000b001'::uuid
  );
  raise notice '00092: Jacobs Org created: %', v_target;
end;
$run$;
