-- 0004_storage_realtime.sql : Supabase-specific (storage bucket + realtime). Run on Supabase only.

-- Public bucket for logos / food photos. Objects are stored under "<restaurant_id>/<file>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "media_public_read" on storage.objects for select using (bucket_id = 'media');
create policy "media_staff_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid, array['owner','manager']));
create policy "media_staff_update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid, array['owner','manager']));
create policy "media_staff_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid, array['owner','manager']));

-- Realtime: staff dashboards subscribe to orders (RLS limits events to the staff member's own restaurants).
alter publication supabase_realtime add table public.orders;
