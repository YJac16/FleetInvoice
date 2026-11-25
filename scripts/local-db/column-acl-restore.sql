-- Local test bootstrap only. Pairs with column-acl-snapshot.sql: after the
-- broad grant, drop table-level SELECT again on each table that had
-- column-only SELECT and re-grant exactly the recorded columns, so the DB
-- matches what the migrations leave on a hosted database.
do $$
declare
  r record;
begin
  for r in
    select table_name,
           string_agg(quote_ident(column_name), ', ' order by column_name) as cols
    from _bootstrap_acl.column_select
    group by table_name
  loop
    execute format('revoke select on table public.%I from authenticated', r.table_name);
    execute format('grant select (%s) on table public.%I to authenticated', r.cols, r.table_name);
    raise notice 'restored column-only SELECT on public.%', r.table_name;
  end loop;
end $$;

drop schema _bootstrap_acl cascade;
