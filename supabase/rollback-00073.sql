-- =============================================================================
-- ROLLBACK: 00073_maintenance_schema.sql  (Fleet maintenance Drop 1, U1)
-- =============================================================================
-- Manual script, not part of the migration chain. Reverses 00073 only.
-- Run rollback-00075 and rollback-00074 first (the RPCs reference these
-- tables). If 00076 is applied, run rollback-00076 first as well.
--
-- DATA LOSS: drops workshop_bill_lines, workshop_bills, suppliers and
-- maintenance_categories with all rows. Their triggers, indexes, RLS
-- policies and grants go with the tables. No CASCADE is used, so an
-- unexpected dependent object makes the script fail instead of being dropped.
--
-- Also deletes any 'maintenance' rows from module_entitlements and restores
-- module_entitlements_key_check to the pre-00073 list (as set by 00016).
-- =============================================================================

begin;

-- Children before parents.
drop table if exists public.workshop_bill_lines;
drop table if exists public.workshop_bills;
drop table if exists public.suppliers;
drop table if exists public.maintenance_categories;

-- Table triggers are gone with the tables; now the functions they used.
drop function if exists public.guard_workshop_bill_line_same_org();
drop function if exists public.guard_workshop_bill_same_org();

-- Module key: remove grants, then narrow the constraint back (00016 list).
delete from public.module_entitlements where module_key = 'maintenance';

alter table public.module_entitlements
  drop constraint if exists module_entitlements_key_check;
alter table public.module_entitlements
  add constraint module_entitlements_key_check check (
    module_key in (
      'core',
      'gps',
      'attendance',
      'billing',
      'payroll',
      'reports',
      'portal',
      'white_label',
      'sso',
      'integrations',
      'ai'
    )
  );

commit;
