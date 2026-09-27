-- Phase 2 compliance document enums (idempotent).

alter type public.vehicle_doc_type add value if not exists 'operating_permit';
alter type public.vehicle_doc_type add value if not exists 'registration_certificate';

do $$ begin
  create type public.driver_doc_type as enum ('driver_licence', 'prdp');
exception when duplicate_object then null; end $$;
