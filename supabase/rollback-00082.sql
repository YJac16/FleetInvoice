-- =============================================================================
-- ROLLBACK: 00082_delete_workshop_bill_supplier_audit.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Restores delete_workshop_bill
-- exactly as 00078 defined it (audit metadata without supplier_name). Audit
-- rows already written keep their supplier_name.
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
begin
  perform public.maintenance_assert_writer(p_actor, p_org);

  select b.status, b.invoice_ref, b.total_incl into v_status, v_invoice_ref, v_total
  from public.workshop_bills b
  where b.id = p_id
    and b.organisation_id = p_org
    and b.deleted_at is null
  for update;
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
    jsonb_build_object('invoice_ref', v_invoice_ref, 'total_incl', v_total),
    p_actor
  );
end;
$$;

revoke all on function public.delete_workshop_bill(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_workshop_bill(uuid, uuid, uuid) to service_role;

commit;
