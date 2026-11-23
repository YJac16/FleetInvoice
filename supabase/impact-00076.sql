-- =============================================================================
-- IMPACT QUERY for 00076_goops_entitlements.sql — READ ONLY (SELECT only)
-- =============================================================================
-- Run on live BEFORE applying 00076, and review the output. Not part of the
-- migration chain; changes nothing.
--
-- One row per organisation that 00076 changes for portal/passengers users:
--   - loses_portal: the org has portal today and won't after 00076. That is
--     every org on Starter / Growth / Scale (portal removed from those plans)
--     and every org with no trialing/active subscription (the fallback no
--     longer includes portal).
--   - passengers: no plan grants it, so every employee member is affected.
-- Counts show who is hit: active company managers / employees, and pending
-- invitations for those roles. Orgs with no such users are still listed
-- when they lose portal, so the plan change is visible.
-- =============================================================================

with active_sub as (
  select s.organisation_id, p.id as plan_id, p.code as plan_code
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.status in ('trialing', 'active')
),
portal_today as (
  select
    o.id as organisation_id,
    a.plan_code,
    case
      -- 00060 fallback includes portal when there is no trialing/active plan
      when a.organisation_id is null then true
      else exists (
        select 1 from public.module_entitlements e
        where e.plan_id = a.plan_id and e.module_key = 'portal'
      )
    end as has_portal
  from public.organisations o
  left join active_sub a on a.organisation_id = o.id
  where o.deleted_at is null
),
people as (
  select
    m.organisation_id,
    count(*) filter (where m.role = 'company_manager' and m.status = 'active') as company_managers,
    count(*) filter (where m.role = 'employee' and m.status = 'active') as employees
  from public.organisation_members m
  group by m.organisation_id
),
invites as (
  select
    i.organisation_id,
    count(*) filter (where i.role = 'company_manager') as pending_company_manager_invites,
    count(*) filter (where i.role = 'employee') as pending_employee_invites
  from public.invitations i
  where i.status = 'pending' and i.deleted_at is null
  group by i.organisation_id
)
select
  o.id as organisation_id,
  o.name,
  coalesce(t.plan_code, '(none: fallback)') as plan,
  (t.has_portal and (t.plan_code is null or t.plan_code in ('starter', 'growth', 'scale')))
    as loses_portal,
  coalesce(pp.company_managers, 0) as active_company_managers,
  coalesce(pp.employees, 0) as active_employees,
  coalesce(iv.pending_company_manager_invites, 0) as pending_company_manager_invites,
  coalesce(iv.pending_employee_invites, 0) as pending_employee_invites
from public.organisations o
join portal_today t on t.organisation_id = o.id
left join people pp on pp.organisation_id = o.id
left join invites iv on iv.organisation_id = o.id
where
  (t.has_portal and (t.plan_code is null or t.plan_code in ('starter', 'growth', 'scale')))
  or coalesce(pp.company_managers, 0) > 0
  or coalesce(pp.employees, 0) > 0
  or coalesce(iv.pending_company_manager_invites, 0) > 0
  or coalesce(iv.pending_employee_invites, 0) > 0
order by
  coalesce(pp.company_managers, 0) + coalesce(pp.employees, 0)
    + coalesce(iv.pending_company_manager_invites, 0)
    + coalesce(iv.pending_employee_invites, 0) desc,
  o.name;
