-- Receipt photos (design.md §7): private bucket, objects stored as
-- receipts/<trip_id>/<uuid>.jpg. Access follows trip_access via the first path segment.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Returns the trip id encoded in an object path, or null when the first segment is not a uuid.
create function public.receipt_trip_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
  end;
$$;

create policy "trip members can read receipts"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.has_trip_access(public.receipt_trip_id(name)));

create policy "trip members can upload receipts"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.has_trip_access(public.receipt_trip_id(name)));

create policy "trip members can delete receipts"
  on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.has_trip_access(public.receipt_trip_id(name)));
