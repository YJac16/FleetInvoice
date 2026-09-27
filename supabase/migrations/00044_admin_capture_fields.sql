-- Admin capture: PrDP categories on drivers; VIN / engine number on vehicles.

alter table public.drivers
  add column if not exists pdp_categories text;

comment on column public.drivers.pdp_categories is
  'PrDP category codes (e.g. G,P). Nullable.';

alter table public.drivers
  drop constraint if exists drivers_pdp_categories_len_chk;

alter table public.drivers
  add constraint drivers_pdp_categories_len_chk check (
    pdp_categories is null or length(btrim(pdp_categories)) between 1 and 40
  );

alter table public.vehicles
  add column if not exists vin text,
  add column if not exists engine_number text;

comment on column public.vehicles.vin is 'Vehicle identification number (nullable).';
comment on column public.vehicles.engine_number is 'Engine number (nullable).';

alter table public.vehicles drop constraint if exists vehicles_vin_len_chk;
alter table public.vehicles
  add constraint vehicles_vin_len_chk check (
    vin is null or length(btrim(vin)) between 1 and 40
  );

alter table public.vehicles drop constraint if exists vehicles_engine_number_len_chk;
alter table public.vehicles
  add constraint vehicles_engine_number_len_chk check (
    engine_number is null or length(btrim(engine_number)) between 1 and 40
  );
