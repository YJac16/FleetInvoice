-- 00083: defence-in-depth lock for Final (status 'approved') workshop bills.
-- The app calls a bill "Final"; the DB value stays 'approved' (00074).
-- approve_workshop_bill / save_workshop_bill / delete_workshop_bill already
-- refuse approved bills. These triggers make that hold for any other write
-- path (direct SQL, future RPCs): UPDATE or DELETE of an approved bill, or of
-- one of its lines, raises 'bill_approved_locked'.
--
-- Allowed on purpose:
--   * the approve transition itself (OLD.status = 'draft'),
--   * everything on draft bills (save, soft delete via delete_workshop_bill),
--   * cascades from a parent that is being deleted (the parent row is already
--     gone in this transaction, so the line trigger finds no approved parent).
-- No new enum value, no reopen function.
begin;

create or replace function public.guard_workshop_bill_final()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'approved' then
    raise exception 'bill_approved_locked';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- security definer so the parent lookup isn't hidden by RLS. FOR SHARE makes a
-- concurrent approve (which takes FOR UPDATE on the bill) serialise with us.
create or replace function public.guard_workshop_bill_line_final()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  select b.status into v_status
  from public.workshop_bills b
  where b.id = old.bill_id
  for share;
  if v_status = 'approved' then
    raise exception 'bill_approved_locked';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_workshop_bill_final() from public, anon, authenticated;
revoke all on function public.guard_workshop_bill_line_final() from public, anon, authenticated;

drop trigger if exists workshop_bills_final_lock on public.workshop_bills;
create trigger workshop_bills_final_lock
before update or delete on public.workshop_bills
for each row execute function public.guard_workshop_bill_final();

drop trigger if exists workshop_bill_lines_final_lock on public.workshop_bill_lines;
create trigger workshop_bill_lines_final_lock
before update or delete on public.workshop_bill_lines
for each row execute function public.guard_workshop_bill_line_final();

commit;
