-- 00096: generate_period_invoice stamps invoices.owner_tag (run after all migrations).
-- Self-asserting (raises on failure) and rolls back. Local test DBs only.
--   psql -v ON_ERROR_STOP=1 -d <db> -f tests/rls/period_invoice_owner_stamp_checks.sql
begin;

create function pg_temp.mk_trip(p_org uuid, p_co uuid, p_veh uuid, p_driver uuid, p_start timestamptz)
returns void language plpgsql as $$
declare t uuid := gen_random_uuid();
begin
  insert into public.trips (id, organisation_id, planned_start, status, is_staff_transport, company_id, area_text)
    values (t, p_org, p_start, 'completed', true, p_co, 'Area');
  insert into public.trip_assignments (organisation_id, trip_id, driver_id, vehicle_id)
    values (p_org, t, p_driver, p_veh);
end $$;

create function pg_temp.expect(p_label text, p_got text, p_want text)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL %: got %, want %', p_label, p_got, p_want;
  end if;
  raise notice 'ok %', p_label;
end $$;

do $$
declare
  org uuid := gen_random_uuid();
  uid uuid := gen_random_uuid();
  co uuid := gen_random_uuid();
  veh uuid := gen_random_uuid();
  d_y1 uuid := gen_random_uuid();
  d_y2 uuid := gen_random_uuid();
  d_f uuid := gen_random_uuid();
  d_n uuid := gen_random_uuid();
  inv public.invoices;
  again public.invoices;
begin
  insert into auth.users (id) values (uid);
  insert into public.profiles (id, email, is_platform_owner)
    values (uid, 'stamp@example.test', true)
    on conflict (id) do update set is_platform_owner = true;
  perform set_config('request.jwt.claim.sub', uid::text, true);

  insert into public.organisations (id, name, slug) values (org, 'Stamp Org', 'stamp-' || org);
  insert into public.companies (id, organisation_id, name) values (co, org, 'Stamp Co');
  insert into public.vehicles (id, organisation_id, company_id, name) values (veh, org, co, 'V1');
  insert into public.drivers (id, organisation_id, full_name, owner_tag) values
    (d_y1, org, 'Y1', 'yaseen'), (d_y2, org, 'Y2', 'yaseen'),
    (d_f, org, 'F', 'fadia'), (d_n, org, 'N', null);
  insert into public.rate_cards (organisation_id, company_id, name, line_type, unit, unit_amount, effective_from)
    values (org, co, 'Trip', 'trip', 'trip', 100, date '2020-01-01');

  -- 1) all included trips share one owner -> stamped, still issued
  perform pg_temp.mk_trip(org, co, veh, d_y1, timestamptz '2025-01-02 08:00+00');
  perform pg_temp.mk_trip(org, co, veh, d_y2, timestamptz '2025-01-03 08:00+00');
  inv := public.generate_period_invoice(org, co, date '2025-01-01', date '2025-01-08');
  perform pg_temp.expect('shared owner stamped', inv.owner_tag, 'yaseen');
  perform pg_temp.expect('shared owner status', inv.status::text, 'issued');
  perform pg_temp.expect('shared owner total', inv.total::text, '200.00');
  perform pg_temp.expect('driver_id stays null', coalesce(inv.driver_id::text, 'null'), 'null');

  -- idempotent: second call returns the same row, unchanged
  again := public.generate_period_invoice(org, co, date '2025-01-01', date '2025-01-08');
  perform pg_temp.expect('idempotent id', again.id::text, inv.id::text);
  perform pg_temp.expect('idempotent tag', again.owner_tag, 'yaseen');

  -- 2) mixed owners -> null
  perform pg_temp.mk_trip(org, co, veh, d_y1, timestamptz '2025-02-02 08:00+00');
  perform pg_temp.mk_trip(org, co, veh, d_f, timestamptz '2025-02-03 08:00+00');
  inv := public.generate_period_invoice(org, co, date '2025-02-01', date '2025-02-08');
  perform pg_temp.expect('mixed owners null', coalesce(inv.owner_tag, 'null'), 'null');
  perform pg_temp.expect('mixed owners status', inv.status::text, 'issued');

  -- 3) any null-owner driver among included -> null
  perform pg_temp.mk_trip(org, co, veh, d_f, timestamptz '2025-03-02 08:00+00');
  perform pg_temp.mk_trip(org, co, veh, d_n, timestamptz '2025-03-03 08:00+00');
  inv := public.generate_period_invoice(org, co, date '2025-03-01', date '2025-03-08');
  perform pg_temp.expect('null owner among drivers null', coalesce(inv.owner_tag, 'null'), 'null');

  -- 4) single fadia driver -> fadia
  perform pg_temp.mk_trip(org, co, veh, d_f, timestamptz '2025-04-02 08:00+00');
  inv := public.generate_period_invoice(org, co, date '2025-04-01', date '2025-04-08');
  perform pg_temp.expect('single fadia', inv.owner_tag, 'fadia');

  -- 5) no included trips (fixed/fuel only) -> null
  inv := public.generate_period_invoice(org, co, date '2025-05-01', date '2025-05-08');
  perform pg_temp.expect('no trips null', coalesce(inv.owner_tag, 'null'), 'null');
  perform pg_temp.expect('no trips status', inv.status::text, 'issued');
end $$;

rollback;
