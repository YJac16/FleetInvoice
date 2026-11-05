-- =============================================================================
-- 00056 — Privilege and billing controls
-- =============================================================================
-- 1) profiles.is_platform_owner cannot be self-granted.
-- 2) platform_owner is not an assignable organisation membership/invitation role
--    for JWT sessions (authenticated / anon).
-- 3) invoice_lines SELECT matches invoices SELECT (no driver/employee billing lines).
-- 4) Direct invoices UPDATE is removed; status and totals stay on security-definer RPCs.
-- 5) subscriptions SELECT is limited to platform owners and organisation admins.

-- ---------------------------------------------------------------------------
-- 1) Platform-owner flag
-- ---------------------------------------------------------------------------

create or replace function public.protect_profile_platform_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
begin
  if tg_op = 'UPDATE' and new.is_platform_owner is not distinct from old.is_platform_owner then
    return new;
  end if;

  if tg_op = 'INSERT' and new.is_platform_owner is not true then
    return new;
  end if;

  -- Service role (billing/admin jobs) and non-JWT sessions (SQL editor, migrations)
  -- may bootstrap the first platform owner. PostgREST sets request.jwt.claim.role.
  if v_jwt_role = 'service_role' then
    return new;
  end if;

  if v_jwt_role = '' and auth.uid() is null then
    return new;
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_platform_owner
  ) then
    return new;
  end if;

  raise exception 'is_platform_owner cannot be changed'
    using errcode = '42501';
end;
$$;

drop trigger if exists profiles_protect_platform_owner on public.profiles;
create trigger profiles_protect_platform_owner
  before insert or update on public.profiles
  for each row execute function public.protect_profile_platform_owner();

revoke all on function public.protect_profile_platform_owner() from public, anon, authenticated;

-- Column privileges are defense in depth. A later GRANT UPDATE on the table
-- would widen them again; the trigger above still blocks the flag.
revoke update on table public.profiles from anon, authenticated;
grant update (full_name, phone, avatar_url) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Membership role platform_owner
-- ---------------------------------------------------------------------------

create or replace function public.reject_platform_owner_membership_role()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
begin
  if new.role::text = 'platform_owner' and v_jwt_role in ('authenticated', 'anon') then
    raise exception 'platform_owner cannot be assigned as an organisation role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists organisation_members_reject_platform_owner on public.organisation_members;
create trigger organisation_members_reject_platform_owner
  before insert or update on public.organisation_members
  for each row execute function public.reject_platform_owner_membership_role();

drop trigger if exists invitations_reject_platform_owner on public.invitations;
create trigger invitations_reject_platform_owner
  before insert or update on public.invitations
  for each row execute function public.reject_platform_owner_membership_role();

revoke all on function public.reject_platform_owner_membership_role() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Invoice lines — same reader set as invoices (00030)
-- ---------------------------------------------------------------------------

drop policy if exists invoice_lines_select on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id in (select public.user_organisation_ids())
      and exists (
        select 1
        from public.invoices i
        where i.id = invoice_lines.invoice_id
          and i.organisation_id = invoice_lines.organisation_id
          and i.deleted_at is null
          and (
            public.has_org_role_names(
              i.organisation_id,
              array['organisation_admin', 'manager', 'dispatcher']
            )
            or (
              public.has_company_scope(i.organisation_id, i.company_id)
              and not public.has_org_role_names(
                i.organisation_id,
                array['driver', 'employee']
              )
            )
          )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Invoices — no direct client UPDATE
-- ---------------------------------------------------------------------------
-- set_invoice_status, generators, and draft-line recalculation are
-- SECURITY DEFINER and bypass RLS. There is no invoices INSERT/DELETE policy.

drop policy if exists invoices_update on public.invoices;

-- ---------------------------------------------------------------------------
-- 5) Subscription payment identifiers
-- ---------------------------------------------------------------------------

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin']
    )
  );
