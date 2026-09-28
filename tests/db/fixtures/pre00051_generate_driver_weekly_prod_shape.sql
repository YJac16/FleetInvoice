-- Simulates live production before 00051: single-row return (00022 shape), not 00023 setof.
drop function if exists public.generate_driver_weekly_invoice(uuid, uuid, date, date);

create or replace function public.generate_driver_weekly_invoice(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_period_start date,
  p_period_end date
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into inv
  from public.invoices i
  where i.organisation_id = p_organisation_id
    and i.driver_id = p_driver_id
    and i.period_start = p_period_start
    and i.period_end = p_period_end
    and i.deleted_at is null
  limit 1;
  return inv;
end;
$$;

grant execute on function public.generate_driver_weekly_invoice(uuid, uuid, date, date) to authenticated;
