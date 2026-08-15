-- Private profile photos: owners manage uploads; verified members can view only discoverable verified profiles.
create table if not exists public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  storage_path text not null unique,
  is_primary boolean not null default false,
  position smallint not null default 0 check (position between 0 and 4),
  created_at timestamptz not null default now(),
  constraint profile_photos_path_owned check (split_part(storage_path, '/', 1) = user_id::text)
);
create unique index if not exists profile_photos_one_primary_idx on public.profile_photos (user_id) where is_primary;
create index if not exists profile_photos_user_position_idx on public.profile_photos (user_id, position);
alter table public.profile_photos enable row level security;
grant select, insert, update, delete on public.profile_photos to authenticated;

create policy "members view allowed profile photos" on public.profile_photos for select to authenticated using ((select auth.uid()) = user_id or (private.is_verified_member((select auth.uid())) and private.is_verified_member(user_id) and exists (select 1 from public.profiles p where p.user_id = profile_photos.user_id and p.discoverable)));
create policy "owners add own photos" on public.profile_photos for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owners update own photos" on public.profile_photos for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owners delete own photos" on public.profile_photos for delete to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "members upload own profile photos" on storage.objects for insert to authenticated with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "members read protected profile photos" on storage.objects for select to authenticated using (bucket_id = 'profile-photos' and (owner_id = (select auth.uid())::text or (private.is_verified_member((select auth.uid())) and exists (select 1 from public.profiles p where p.user_id::text = (storage.foldername(name))[1] and p.discoverable and private.is_verified_member(p.user_id)))));
create policy "members update own profile photos" on storage.objects for update to authenticated using (bucket_id = 'profile-photos' and owner_id = (select auth.uid())::text) with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "members delete own profile photos" on storage.objects for delete to authenticated using (bucket_id = 'profile-photos' and owner_id = (select auth.uid())::text);
