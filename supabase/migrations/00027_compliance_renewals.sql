-- =============================================================================
-- WorkOps — Compliance renewals (driver licence/PDP + vehicle documents)
-- =============================================================================

alter table public.drivers
  add column if not exists license_expires_on date,
  add column if not exists pdp_number text,
  add column if not exists pdp_expires_on date;

comment on column public.drivers.license_expires_on is
  'Driver licence expiry date (nullable until captured).';
comment on column public.drivers.pdp_number is
  'Professional Driving Permit number (nullable).';
comment on column public.drivers.pdp_expires_on is
  'Professional Driving Permit expiry date (nullable).';

create index if not exists drivers_license_expires_on_idx
  on public.drivers (organisation_id, license_expires_on)
  where deleted_at is null and license_expires_on is not null;

create index if not exists drivers_pdp_expires_on_idx
  on public.drivers (organisation_id, pdp_expires_on)
  where deleted_at is null and pdp_expires_on is not null;

-- ---------------------------------------------------------------------------
-- list_compliance_renewals — overdue + upcoming (≤ p_within_days)
-- ---------------------------------------------------------------------------

create or replace function public.list_compliance_renewals(
  p_organisation_id uuid,
  p_within_days integer default 90
)
returns table (
  kind text,
  entity_id uuid,
  related_id uuid,
  entity_name text,
  detail text,
  expires_on date,
  days_remaining integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_organisation_id is null then
    raise exception 'organisation_id is required';
  end if;

  if p_within_days is null or p_within_days < 0 then
    raise exception 'within_days must be >= 0';
  end if;

  if not (
    public.is_platform_owner()
    or public.is_org_member(p_organisation_id)
  ) then
    raise exception 'Not authorised';
  end if;

  return query
  select *
  from (
    select
      'driver_license'::text as kind,
      d.id as entity_id,
      d.id as related_id,
      d.full_name as entity_name,
      coalesce(nullif(btrim(d.license_number), ''), 'Licence') as detail,
      d.license_expires_on as expires_on,
      (d.license_expires_on - current_date)::integer as days_remaining
    from public.drivers d
    where d.organisation_id = p_organisation_id
      and d.deleted_at is null
      and d.license_expires_on is not null
      and (d.license_expires_on - current_date) <= p_within_days

    union all

    select
      'driver_pdp'::text as kind,
      d.id as entity_id,
      d.id as related_id,
      d.full_name as entity_name,
      coalesce(nullif(btrim(d.pdp_number), ''), 'PDP') as detail,
      d.pdp_expires_on as expires_on,
      (d.pdp_expires_on - current_date)::integer as days_remaining
    from public.drivers d
    where d.organisation_id = p_organisation_id
      and d.deleted_at is null
      and d.pdp_expires_on is not null
      and (d.pdp_expires_on - current_date) <= p_within_days

    union all

    select
      'vehicle_document'::text as kind,
      vd.id as entity_id,
      vd.vehicle_id as related_id,
      v.name as entity_name,
      vd.name as detail,
      vd.expires_at as expires_on,
      (vd.expires_at - current_date)::integer as days_remaining
    from public.vehicle_documents vd
    join public.vehicles v
      on v.id = vd.vehicle_id
     and v.organisation_id = vd.organisation_id
    where vd.organisation_id = p_organisation_id
      and vd.deleted_at is null
      and v.deleted_at is null
      and vd.expires_at is not null
      and (vd.expires_at - current_date) <= p_within_days
  ) items
  order by expires_on asc, kind asc, entity_name asc;
end;
$$;

grant execute on function public.list_compliance_renewals(uuid, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- enqueue_compliance_renewals_digests — weekly cron (service role)
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_compliance_renewals_digests(
  p_within_days integer default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  org record;
  admin record;
  lines text[];
  body text;
  subject text;
  enqueued integer := 0;
  item record;
begin
  if p_within_days is null or p_within_days < 0 then
    raise exception 'within_days must be >= 0';
  end if;

  for org in
    select o.id, o.name
    from public.organisations o
    where o.deleted_at is null
      and o.status = 'active'
  loop
    lines := array[]::text[];

    for item in
      select *
      from (
        select
          'driver_license'::text as kind,
          d.id as entity_id,
          d.id as related_id,
          d.full_name as entity_name,
          coalesce(nullif(btrim(d.license_number), ''), 'Licence') as detail,
          d.license_expires_on as expires_on,
          (d.license_expires_on - current_date)::integer as days_remaining
        from public.drivers d
        where d.organisation_id = org.id
          and d.deleted_at is null
          and d.license_expires_on is not null
          and (d.license_expires_on - current_date) <= p_within_days

        union all

        select
          'driver_pdp'::text as kind,
          d.id as entity_id,
          d.id as related_id,
          d.full_name as entity_name,
          coalesce(nullif(btrim(d.pdp_number), ''), 'PDP') as detail,
          d.pdp_expires_on as expires_on,
          (d.pdp_expires_on - current_date)::integer as days_remaining
        from public.drivers d
        where d.organisation_id = org.id
          and d.deleted_at is null
          and d.pdp_expires_on is not null
          and (d.pdp_expires_on - current_date) <= p_within_days

        union all

        select
          'vehicle_document'::text as kind,
          vd.id as entity_id,
          vd.vehicle_id as related_id,
          v.name as entity_name,
          vd.name as detail,
          vd.expires_at as expires_on,
          (vd.expires_at - current_date)::integer as days_remaining
        from public.vehicle_documents vd
        join public.vehicles v
          on v.id = vd.vehicle_id
         and v.organisation_id = vd.organisation_id
        where vd.organisation_id = org.id
          and vd.deleted_at is null
          and v.deleted_at is null
          and vd.expires_at is not null
          and (vd.expires_at - current_date) <= p_within_days
      ) renewals
      order by expires_on asc, kind asc, entity_name asc
    loop
      lines := array_append(
        lines,
        format(
          '- [%s] %s — %s (expires %s, %s day(s))',
          item.kind,
          item.entity_name,
          item.detail,
          to_char(item.expires_on, 'YYYY-MM-DD'),
          item.days_remaining
        )
      );
    end loop;

    if coalesce(array_length(lines, 1), 0) = 0 then
      continue;
    end if;

    body := format(
      E'Compliance renewals for %s\n\nItems due within %s days or already overdue:\n\n%s\n\nOpen WorkOps → Compliance for the full list.',
      org.name,
      p_within_days,
      array_to_string(lines, E'\n')
    );

    subject := format('[%s] Compliance renewals due (≤%s days)', org.name, p_within_days);

    for admin in
      select distinct lower(trim(p.email)) as email
      from public.organisation_members m
      join public.profiles p on p.id = m.user_id
      where m.organisation_id = org.id
        and m.deleted_at is null
        and m.status = 'active'
        and m.role in ('organisation_admin'::public.app_role, 'manager'::public.app_role)
        and p.email is not null
        and btrim(p.email) <> ''
    loop
      insert into public.notification_outbox (
        organisation_id,
        channel,
        recipient,
        subject,
        body,
        template_key,
        payload,
        created_by
      )
      values (
        org.id,
        'email',
        admin.email,
        subject,
        body,
        'compliance_renewals_digest',
        jsonb_build_object(
          'within_days', p_within_days,
          'organisation_id', org.id
        ),
        null
      );

      enqueued := enqueued + 1;
    end loop;
  end loop;

  return enqueued;
end;
$$;

revoke all on function public.enqueue_compliance_renewals_digests(integer) from public;
grant execute on function public.enqueue_compliance_renewals_digests(integer)
  to service_role;

comment on function public.list_compliance_renewals(uuid, integer) is
  'Renewals dashboard: driver licence/PDP and vehicle document expiry within N days (includes overdue).';
comment on function public.enqueue_compliance_renewals_digests(integer) is
  'Cron: enqueue compliance digest emails to org admins/managers via notification_outbox.';
