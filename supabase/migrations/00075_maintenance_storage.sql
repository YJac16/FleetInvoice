-- =============================================================================
-- 00075 — Fleet maintenance Drop 1, unit U3: workshop bill attachment
-- =============================================================================
-- Builds on 00073 (schema) and 00074 (audited RPCs).
--
-- 1) Private storage bucket 'workshop-bills' (10 MB, pdf/jpeg/png/webp), same
--    shape as the 00039 vehicle-docs bucket. There are NO storage.objects
--    policies for this bucket: clients can't list, read or write it. The API
--    uploads and signs URLs with the service role only.
--    Object path: {organisation_id}/{bill_id}/{uuid}.{ext}
--
-- 2) set_workshop_bill_attachment(p_actor, p_org, p_bill_id, p_path, p_mime,
--    p_size) -> text (the previous attachment_path, or null)
--    Sets the bill's attachment, or clears it when p_path is null (then
--    p_mime and p_size must be null too). Checks role + 'maintenance'
--    entitlement via maintenance_assert_writer (00074), that the bill belongs
--    to p_org, that the bill is not approved, and that the path sits under
--    {p_org}/{p_bill_id}/. Writes the audit log. service_role only.
--    Returns the previous path so the API can remove the old object.
--
-- No changes to invoices, rate cards or existing policies.

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workshop-bills',
  'workshop-bills',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- set_workshop_bill_attachment
-- ---------------------------------------------------------------------------

create or replace function public.set_workshop_bill_attachment(
  p_actor uuid,
  p_org uuid,
  p_bill_id uuid,
  p_path text,
  p_mime text,
  p_size integer
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_prev text;
  v_prefix text;
  v_ext text;
begin
  perform public.maintenance_assert_writer(p_actor, p_org);

  if p_bill_id is null then
    raise exception 'not_found';
  end if;

  select b.status, b.attachment_path into v_status, v_prev
  from public.workshop_bills b
  where b.id = p_bill_id
    and b.organisation_id = p_org
    and b.deleted_at is null
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status = 'approved' then
    raise exception 'bill_approved_locked';
  end if;

  if p_path is null then
    if p_mime is not null or p_size is not null then
      raise exception 'invalid_attachment';
    end if;

    update public.workshop_bills set
      attachment_path = null,
      attachment_mime = null,
      attachment_size = null
    where id = p_bill_id;

    perform public.write_audit_log(
      p_org, 'workshop_bill.attachment_cleared', 'workshop_bill', p_bill_id,
      jsonb_build_object('previous_path', v_prev),
      p_actor
    );
    return v_prev;
  end if;

  if p_mime is null or p_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
    raise exception 'invalid_attachment_mime';
  end if;
  if p_size is null or p_size <= 0 or p_size > 10485760 then
    raise exception 'invalid_attachment_size';
  end if;

  v_ext := case p_mime
    when 'application/pdf' then 'pdf'
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
  end;
  v_prefix := p_org::text || '/' || p_bill_id::text || '/';
  if left(p_path, length(v_prefix)) <> v_prefix
     or substr(p_path, length(v_prefix) + 1)
        !~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.' || v_ext || '$')
  then
    raise exception 'invalid_attachment_path';
  end if;

  update public.workshop_bills set
    attachment_path = p_path,
    attachment_mime = p_mime,
    attachment_size = p_size
  where id = p_bill_id;

  perform public.write_audit_log(
    p_org, 'workshop_bill.attachment_set', 'workshop_bill', p_bill_id,
    jsonb_build_object(
      'path', p_path,
      'mime', p_mime,
      'size', p_size,
      'previous_path', v_prev
    ),
    p_actor
  );
  return v_prev;
end;
$$;

comment on function public.set_workshop_bill_attachment(uuid, uuid, uuid, text, text, integer) is
  'Audited: set or clear (p_path null) a draft workshop bill''s attachment. Returns the previous path. service_role only.';

revoke all on function public.set_workshop_bill_attachment(uuid, uuid, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.set_workshop_bill_attachment(uuid, uuid, uuid, text, text, integer)
  to service_role;
