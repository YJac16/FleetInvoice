-- =============================================================================
-- 00099 — Privilege and billing controls (demo port of PR #49 / old 00056)
-- =============================================================================
-- 1) profiles.is_platform_owner cannot be self-granted.
-- 2) platform_owner is not an assignable organisation membership/invitation role
--    for JWT sessions.
-- 3) Direct invoices UPDATE is removed; status and totals stay on
--    security-definer RPCs. No client code updates invoices directly.
-- 4) subscriptions SELECT is limited to platform owners and organisation admins.
--
-- Not ported: PR #49's invoice_lines_select. Demo's current policy (00081)
-- already mirrors invoices_select and is stricter.
--
-- Rollback: supabase/rollback-00099.sql (manual).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Platform-owner flag
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: current_user is the role the statement runs as.
-- PostgREST sessions run as authenticated / anon (via authenticator). Migrations,
-- the SQL editor, service_role and security-definer functions owned by postgres
-- are not in that list and pass through. Does not read request.jwt.claim.*.

create or replace function public.protect_profile_platform_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.is_platform_owner is not distinct from old.is_platform_owner then
    return new;
  end if;

  if tg_op = 'INSERT' and new.is_platform_owner is not true then
    return new;
  end if;

  if current_user in ('authenticated', 'anon', 'authenticator')
     and not public.is_platform_owner() then
    raise exception 'is_platform_owner cannot be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_platform_owner on public.profiles;
create trigger profiles_protect_platform_owner
  before insert or update on public.profiles
  for each row execute function public.protect_profile_platform_owner();

revoke all on function public.protect_profile_platform_owner() from public, anon, authenticated;

-- Column privileges are defense in depth. The only client update is
-- services/profile.service.ts updateProfile(): full_name, phone, avatar_url.
-- The profiles_update policy is unchanged.
revoke update on table public.profiles from anon, authenticated;
grant update (full_name, phone, avatar_url) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Membership role platform_owner
-- ---------------------------------------------------------------------------
-- platform_owner is a value of app_role (00001), so organisation_members.role
-- and invitations.role can hold it.

create or replace function public.reject_platform_owner_membership_role()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.role::text = 'platform_owner'
     and current_user in ('authenticated', 'anon', 'authenticator')
     and (tg_op = 'INSERT' or new.role is distinct from old.role) then
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
-- 3) Invoices — no direct client UPDATE
-- ---------------------------------------------------------------------------
-- set_invoice_status, generators and draft-line recalculation are SECURITY
-- DEFINER and bypass RLS.

drop policy if exists invoices_update on public.invoices;

-- ---------------------------------------------------------------------------
-- 4) Subscription payment identifiers
-- ---------------------------------------------------------------------------
-- Safe for module access: lib/auth/module-access.ts and app/api/billing/* use
-- the service client, org_entitled_modules() and maintenance_assert_writer()
-- are security definer, and the Membership page (subscriptions:view) is only
-- available to platform_owner and organisation_admin.

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
