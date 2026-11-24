-- =============================================================================
-- ROLLBACK: 00075_maintenance_storage.sql  (Fleet maintenance Drop 1, U3)
-- =============================================================================
-- Manual script, not part of the migration chain. Reverses 00075 only.
-- Run in reverse order: rollback-00075, then rollback-00074, then rollback-00073.
--
-- Drops set_workshop_bill_attachment and the private 'workshop-bills' bucket.
-- 00075 creates no storage.objects policies, so there are none to drop.
--
-- DATA SAFETY: the bucket holds uploaded bill files. This script REFUSES to
-- delete the bucket while it still has objects (and aborts the whole script).
-- Empty it first through the Storage API/dashboard, then re-run.
-- =============================================================================

begin;

do $$
begin
  if exists (select 1 from storage.buckets where id = 'workshop-bills')
     and exists (select 1 from storage.objects where bucket_id = 'workshop-bills') then
    raise exception
      'rollback-00075: bucket workshop-bills still has objects; empty it via the Storage API first';
  end if;
end
$$;

drop function if exists public.set_workshop_bill_attachment(uuid, uuid, uuid, text, text, integer);

delete from storage.buckets where id = 'workshop-bills';

commit;
