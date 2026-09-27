-- =============================================================================
-- WorkOps — driver_notification_type: compliance_expiry (separate migration)
-- Enum new values cannot be used in the same transaction on PostgreSQL.
-- Requires 00032_driver_vehicle_compliance.sql
-- =============================================================================

alter type public.driver_notification_type add value if not exists 'compliance_expiry';

-- ---------------------------------------------------------------------------
-- enqueue_compliance_expiry_alerts — daily cron (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_compliance_expiry_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.compliance_today_sast();
  v_inserted uuid;
  v_count integer := 0;
  rec record;
  v_days integer;
  v_milestone text;
  v_title text;
  v_body text;
  v_link text;
  admin_rec record;
  v_driver_id uuid;
  v_driver_user uuid;
begin
  for rec in
    select * from (
      select
        'driver_license'::text as subject_kind,
        d.id as subject_id,
        d.organisation_id,
        d.id as driver_id,
        null::uuid as vehicle_id,
        d.full_name as subject_name,
        null::text as registration_number,
        null::text as document_label,
        d.license_expires_on as expires_on
      from public.drivers d
      join public.organisations o on o.id = d.organisation_id
      where d.deleted_at is null
        and d.status = 'active'
        and o.deleted_at is null
        and o.status = 'active'
        and d.license_expires_on is not null

      union all

      select
        'driver_pdp'::text,
        d.id,
        d.organisation_id,
        d.id,
        null::uuid,
        d.full_name,
        null::text,
        null::text,
        d.pdp_expires_on
      from public.drivers d
      join public.organisations o on o.id = d.organisation_id
      where d.deleted_at is null
        and d.status = 'active'
        and o.deleted_at is null
        and o.status = 'active'
        and d.pdp_expires_on is not null

      union all

      select
        'vehicle_permit'::text,
        v.id,
        v.organisation_id,
        a.driver_id,
        v.id,
        v.name,
        v.registration_number,
        null::text,
        v.operating_permit_expires_on
      from public.vehicles v
      join public.organisations o on o.id = v.organisation_id
      left join lateral (
        select dva.driver_id
        from public.driver_vehicle_assignments dva
        where dva.vehicle_id = v.id
          and dva.ends_on is null
          and dva.deleted_at is null
        limit 1
      ) a on true
      where v.deleted_at is null
        and v.status = 'active'
        and o.deleted_at is null
        and o.status = 'active'
        and v.operating_permit_expires_on is not null

      union all

      select
        'vehicle_disc'::text,
        v.id,
        v.organisation_id,
        a.driver_id,
        v.id,
        v.name,
        v.registration_number,
        null::text,
        v.license_disc_expires_on
      from public.vehicles v
      join public.organisations o on o.id = v.organisation_id
      left join lateral (
        select dva.driver_id
        from public.driver_vehicle_assignments dva
        where dva.vehicle_id = v.id
          and dva.ends_on is null
          and dva.deleted_at is null
        limit 1
      ) a on true
      where v.deleted_at is null
        and v.status = 'active'
        and o.deleted_at is null
        and o.status = 'active'
        and v.license_disc_expires_on is not null

      union all

      select
        'vehicle_document'::text,
        vd.id,
        vd.organisation_id,
        a.driver_id,
        v.id,
        v.name,
        v.registration_number,
        vd.name,
        vd.expires_at
      from public.vehicle_documents vd
      join public.vehicles v on v.id = vd.vehicle_id and v.organisation_id = vd.organisation_id
      join public.organisations o on o.id = vd.organisation_id
      left join lateral (
        select dva.driver_id
        from public.driver_vehicle_assignments dva
        where dva.vehicle_id = v.id
          and dva.ends_on is null
          and dva.deleted_at is null
        limit 1
      ) a on true
      where vd.deleted_at is null
        and v.deleted_at is null
        and v.status = 'active'
        and o.deleted_at is null
        and o.status = 'active'
        and vd.expires_at is not null
        and vd.doc_type not in ('license_disk')
    ) items
  loop
    v_days := (rec.expires_on - v_today)::integer;
    v_milestone := public.compliance_milestone_for_days(v_days);
    if v_milestone is null then
      continue;
    end if;

    v_title := case rec.subject_kind
      when 'driver_license' then 'Driver licence expiry'
      when 'driver_pdp' then 'Professional Driving Permit (PrDP) expiry'
      when 'vehicle_permit' then 'Vehicle operating permit expiry'
      when 'vehicle_disc' then 'Vehicle licence disc expiry'
      else 'Vehicle document expiry'
    end;

    v_body := case
      when rec.subject_kind = 'driver_pdp' and v_milestone = 'expired' then
        format('Your Professional Driving Permit (PrDP) expired on %s.', to_char(rec.expires_on, 'DD Mon YYYY'))
      when rec.subject_kind = 'driver_pdp' then
        format(
          'Your Professional Driving Permit (PrDP) expires in %s days (%s).',
          case v_milestone when 'expired' then '0' else v_milestone end,
          to_char(rec.expires_on, 'DD Mon YYYY')
        )
      when rec.subject_kind = 'driver_license' and v_milestone = 'expired' then
        format('Your driver licence expired on %s.', to_char(rec.expires_on, 'DD Mon YYYY'))
      when rec.subject_kind = 'driver_license' then
        format(
          'Your driver licence expires in %s days (%s).',
          case v_milestone when 'expired' then '0' else v_milestone end,
          to_char(rec.expires_on, 'DD Mon YYYY')
        )
      when rec.registration_number is not null and v_milestone = 'expired' then
        format(
          'Vehicle %s: %s expired on %s.',
          rec.registration_number,
          case rec.subject_kind
            when 'vehicle_permit' then 'operating permit'
            when 'vehicle_disc' then 'licence disc'
            else coalesce(rec.document_label, 'document')
          end,
          to_char(rec.expires_on, 'DD Mon YYYY')
        )
      else
        format(
          '%s expires in %s days (%s).',
          rec.subject_name,
          case v_milestone when 'expired' then '0' else v_milestone end,
          to_char(rec.expires_on, 'DD Mon YYYY')
        )
    end;

    v_link := case rec.subject_kind
      when 'driver_license' then format('/drivers?edit=%s', rec.driver_id)
      when 'driver_pdp' then format('/drivers?edit=%s', rec.driver_id)
      else format('/vehicles?edit=%s', coalesce(rec.vehicle_id, rec.subject_id))
    end;

    -- Admin recipients: organisation_admin + manager only (Open decision 1 default)
    for admin_rec in
      select distinct m.user_id
      from public.organisation_members m
      where m.organisation_id = rec.organisation_id
        and m.deleted_at is null
        and m.status = 'active'
        and m.role in (
          'organisation_admin'::public.app_role,
          'manager'::public.app_role
        )
    loop
      insert into public.compliance_alerts_sent (
        organisation_id,
        subject_kind,
        subject_id,
        expires_on,
        milestone,
        audience,
        recipient_user_id
      )
      values (
        rec.organisation_id,
        rec.subject_kind,
        rec.subject_id,
        rec.expires_on,
        v_milestone,
        'admin',
        admin_rec.user_id
      )
      on conflict do nothing
      returning id into v_inserted;

      if v_inserted is not null then
        insert into public.admin_inbox_notifications (
          organisation_id,
          recipient_user_id,
          notification_type,
          title,
          body,
          link_path,
          subject_kind,
          subject_id
        )
        values (
          rec.organisation_id,
          admin_rec.user_id,
          'compliance_expiry',
          v_title,
          v_body,
          '/compliance',
          rec.subject_kind,
          rec.subject_id
        );
        v_count := v_count + 1;
      end if;
    end loop;

    -- Driver recipient when eligible
    v_driver_id := rec.driver_id;
    v_driver_user := null;
    if v_driver_id is not null then
      select d.profile_id into v_driver_user
      from public.drivers d
      where d.id = v_driver_id
        and d.deleted_at is null
        and d.profile_id is not null;
    end if;

    if v_driver_user is not null then
      insert into public.compliance_alerts_sent (
        organisation_id,
        subject_kind,
        subject_id,
        expires_on,
        milestone,
        audience,
        recipient_user_id
      )
      values (
        rec.organisation_id,
        rec.subject_kind,
        rec.subject_id,
        rec.expires_on,
        v_milestone,
        'driver',
        v_driver_user
      )
      on conflict do nothing
      returning id into v_inserted;

      if v_inserted is not null then
        perform public.enqueue_driver_notification(
          rec.organisation_id,
          v_driver_id,
          'compliance_expiry'::public.driver_notification_type,
          v_title,
          v_body,
          null
        );
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  -- TODO(email-later): outbound email for compliance milestones

  return v_count;
end;
$$;

revoke all on function public.enqueue_compliance_expiry_alerts() from public;
revoke all on function public.enqueue_compliance_expiry_alerts() from anon;
revoke all on function public.enqueue_compliance_expiry_alerts() from authenticated;
grant execute on function public.enqueue_compliance_expiry_alerts() to service_role;
alter function public.enqueue_compliance_expiry_alerts() owner to postgres;

comment on function public.enqueue_compliance_expiry_alerts() is
  'Cron: in-app compliance expiry alerts at 60/30/7/expired milestones (service role only).';
