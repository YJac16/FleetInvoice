-- =============================================================================
-- 00082: supplier name in the workshop_bill.deleted audit metadata
-- =============================================================================
-- Recreates delete_workshop_bill from 00078 (its latest definition; 00074 has
-- no delete RPC). Only change: the audit metadata gains 'supplier_name' (the
-- bill's supplier, same org; null if the supplier row is gone). Signature,
-- writer check, draft-only rule, errors and grants are unchanged. The lock is
-- "for update of b" so only the bill row is locked, as before.
-- Rollback: supabase/rollback-00082.sql
-- =============================================================================

begin;

create or replace function public.delete_workshop_bill(
  p_actor uuid,
  p_org uuid,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_invoice_ref text;
  v_total numeric(14, 2);
  v_supplier_name text;
begin
  perform public.maintenance_assert_writer(p_actor, p_org);

  select b.status, b.invoice_ref, b.total_incl, s.name
    into v_status, v_invoice_ref, v_total, v_supplier_name
  from public.workshop_bills b
  left join public.suppliers s
    on s.id = b.supplier_id
   and s.organisation_id = b.organisation_id
  where b.id = p_id
    and b.organisation_id = p_org
    and b.deleted_at is null
  for update of b;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'bill_not_draft';
  end if;

  update public.workshop_bills set
    deleted_at = timezone('utc', now())
  where id = p_id;

  perform public.write_audit_log(
    p_org, 'workshop_bill.deleted', 'workshop_bill', p_id,
    jsonb_build_object(
      'invoice_ref', v_invoice_ref,
      'total_incl', v_total,
      'supplier_name', v_supplier_name
    ),
    p_actor
  );
end;
$$;

revoke all on function public.delete_workshop_bill(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_workshop_bill(uuid, uuid, uuid) to service_role;

commit;
