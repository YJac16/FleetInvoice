-- Local test bootstrap only. Run after the migrations and before
-- bootstrap-native.sh's broad "GRANT ... ON ALL TABLES ... TO authenticated".
--
-- Some migrations deliberately leave authenticated without table-level SELECT
-- and grant SELECT on a column list instead (00079 trips price columns, 00086
-- fuel_fillups money columns). The broad grant would re-open those tables and
-- hide the revokes from every RLS/DB test. Record the column-only SELECT ACLs
-- here; column-acl-restore.sql puts them back after the broad grant.
drop schema if exists _bootstrap_acl cascade;
create schema _bootstrap_acl;
create table _bootstrap_acl.column_select as
select c.relname::text as table_name, a.attname::text as column_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and not has_table_privilege('authenticated', c.oid, 'SELECT')
  and has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT');

do $$
declare r record;
begin
  for r in select table_name, count(*) as n from _bootstrap_acl.column_select group by 1 order by 1 loop
    raise notice 'column-only SELECT for authenticated: public.% (% columns)', r.table_name, r.n;
  end loop;
end $$;
