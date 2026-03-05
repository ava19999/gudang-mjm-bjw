-- Create/update bucket for Supabase Storage-based egress cache snapshots.
-- Run this migration in Supabase SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('egress-cache', 'egress-cache', true, null, array['application/json'])
on conflict (id) do update
set
  name = excluded.name,
  public = true,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

-- Public read for cached snapshot objects.
drop policy if exists "egress_cache_public_read" on storage.objects;
create policy "egress_cache_public_read"
on storage.objects
for select
to public
using (bucket_id = 'egress-cache');

-- Allow app clients (anon/authenticated) to upload snapshot cache files.
drop policy if exists "egress_cache_client_insert" on storage.objects;
create policy "egress_cache_client_insert"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'egress-cache');

drop policy if exists "egress_cache_client_update" on storage.objects;
create policy "egress_cache_client_update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'egress-cache')
with check (bucket_id = 'egress-cache');

drop policy if exists "egress_cache_client_delete" on storage.objects;
create policy "egress_cache_client_delete"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'egress-cache');
