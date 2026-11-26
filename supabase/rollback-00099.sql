-- =============================================================================
-- ROLLBACK: 00099_security_privilege_and_billing.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Restores:
--
--   triggers/functions added by 00099 (dropped)
--   profiles UPDATE grant            table-level for authenticated (Supabase default)
--   policy invoices_update           on invoices      (latest 00085_finance_writes_admin_only.sql)
--   policy subscriptions_select      on subscriptions (latest 00013_phase9_subscriptions.sql)
--
-- invoice_lines_select and profiles_update were not changed by 00099.
-- =============================================================================

begin;

drop trigger if exists profiles_protect_platform_owner on public.profiles;
drop function if exists public.protect_profile_platform_owner();

drop trigger if exists organisation_members_reject_platform_owner on public.organisation_members;
drop trigger if exists invitations_reject_platform_owner on public.invitations;
drop function if exists public.reject_platform_owner_membership_role();

revoke update (full_name, phone, avatar_url) on table public.profiles from authenticated;
grant update on table public.profiles to authenticated;

drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager']
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager']
    )
  );

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select
  using (
    public.is_platform_owner()
    or organisation_id in (select public.user_organisation_ids())
  );

commit;
