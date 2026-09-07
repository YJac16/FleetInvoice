-- Phase 17: Organisation logo storage for invoice print letterhead.
-- Path: {organisation_id}/logo.{ext} — public read; org admins may write.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-logos',
  'org-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists org_logos_select on storage.objects;
create policy org_logos_select on storage.objects
  for select
  using (bucket_id = 'org-logos');

drop policy if exists org_logos_insert on storage.objects;
create policy org_logos_insert on storage.objects
  for insert
  with check (
    bucket_id = 'org-logos'
    and public.has_org_role(
      (storage.foldername(name))[1]::uuid,
      array['organisation_admin']::public.app_role[]
    )
  );

drop policy if exists org_logos_update on storage.objects;
create policy org_logos_update on storage.objects
  for update
  using (
    bucket_id = 'org-logos'
    and public.has_org_role(
      (storage.foldername(name))[1]::uuid,
      array['organisation_admin']::public.app_role[]
    )
  );

drop policy if exists org_logos_delete on storage.objects;
create policy org_logos_delete on storage.objects
  for delete
  using (
    bucket_id = 'org-logos'
    and public.has_org_role(
      (storage.foldername(name))[1]::uuid,
      array['organisation_admin']::public.app_role[]
    )
  );
