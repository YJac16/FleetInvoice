-- Rollback notes for 00052_fuel_slips.sql + 00051_fuel_slip_enums.sql
-- Enum values fuel_slip_queried / fuel_slip_rejected cannot be removed in PostgreSQL.
-- Drop dependent objects before reverting fuel_fillups columns.

drop function if exists public.run_fuel_slip_retention(timestamptz);
drop function if exists public.save_fuel_settings(uuid, uuid, jsonb);
drop function if exists public.audit_fuel_report_export(uuid, uuid, text, date, date, jsonb);
drop function if exists public.audit_fuel_slip_photo_view(uuid, uuid, uuid);
drop function if exists public.privacy_purge_fuel_slip_photo(uuid, uuid, uuid);
drop function if exists public.void_fuel_slip(uuid, uuid, uuid, text);
drop function if exists public.review_fuel_slip(uuid, uuid, uuid, text, text);
drop function if exists public.replace_fuel_slip_photo(uuid, uuid, uuid, jsonb);
drop function if exists public.update_fuel_slip(uuid, uuid, uuid, jsonb);
drop function if exists public.submit_fuel_slip(
  uuid, uuid, uuid, numeric, numeric, public.fuel_entry_method, timestamptz, uuid, uuid,
  numeric, numeric, text, text, text, text, public.fuel_product_type, public.fuel_product_type,
  text, numeric, numeric, numeric, jsonb
);
drop function if exists public.evaluate_fuel_entry_flags(uuid);
drop function if exists public.fuel_upsert_flag(uuid, uuid, public.fuel_flag_code, boolean, jsonb);
drop function if exists public.fuel_storage_path_hash(text);
drop function if exists public.fuel_slip_path_ok(uuid, uuid, text);
drop function if exists public.fuel_slip_actor_ok(uuid, uuid, uuid, boolean);
drop function if exists public.fuel_setting(uuid, text);

drop table if exists public.fuel_entry_flags;
drop table if exists public.fuel_slip_photos;
drop table if exists public.fuel_settings;

alter table public.fuel_fillups
  drop column if exists entry_method,
  drop column if exists review_status,
  drop column if exists authorisation_no,
  drop column if exists slip_vrn,
  drop column if exists slip_vrn_status,
  drop column if exists slip_fuel_type,
  drop column if exists slip_station_name,
  drop column if exists slip_litres,
  drop column if exists slip_unit_price,
  drop column if exists slip_total_amount,
  drop column if exists fuel_type,
  drop column if exists calculated_total,
  drop column if exists reviewed_by,
  drop column if exists reviewed_at,
  drop column if exists review_notes,
  drop column if exists query_notes,
  drop column if exists voided_by,
  drop column if exists voided_at,
  drop column if exists void_reason,
  drop column if exists submitted_at;

alter table public.vehicles
  drop column if exists tank_capacity_litres,
  drop column if exists default_fuel_type;

-- Re-apply 00007 log_fuel_fillup body and grants; re-apply 00031 generate_period_invoice fuel loop without review_status filter.
-- Re-create fuel_fillups_insert / fuel_fillups_update policies from 00007.
-- delete from storage.buckets where id = 'fuel-slips'; -- optional; may orphan storage objects

drop type if exists public.fuel_post_retention_action;
drop type if exists public.fuel_flag_status;
drop type if exists public.fuel_flag_code;
drop type if exists public.fuel_product_type;
drop type if exists public.fuel_slip_vrn_status;
drop type if exists public.fuel_review_status;
drop type if exists public.fuel_entry_method;
