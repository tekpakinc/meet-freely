-- Optional proximity uses coarse quarter-degree cells. Exact coordinates never reach the database.
create table if not exists public.profile_location_cells (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cell_lat smallint not null check (cell_lat between 0 and 720),
  cell_lon smallint not null check (cell_lon between 0 and 1440),
  updated_at timestamptz not null default now()
);

alter table public.profile_location_cells enable row level security;
grant select, insert, update, delete on public.profile_location_cells to authenticated;

create policy "members manage only their location cell" on public.profile_location_cells
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.nearby_member_ids(p_cell_lat integer, p_cell_lon integer)
returns table(user_id uuid, proximity_rank integer)
language sql stable security definer set search_path = '' as $$
  select l.user_id,
    greatest(abs(l.cell_lat::integer - p_cell_lat), abs(l.cell_lon::integer - p_cell_lon)) as proximity_rank
  from public.profile_location_cells l
  join public.profiles p on p.user_id = l.user_id and p.discoverable
  where private.is_verified_member((select auth.uid()))
    and private.is_verified_member(l.user_id)
    and l.user_id <> (select auth.uid())
    and l.updated_at > now() - interval '30 days'
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = l.user_id)
         or (b.blocker_id = l.user_id and b.blocked_id = (select auth.uid()))
    )
  order by proximity_rank, l.updated_at desc
  limit 250
$$;

revoke all on function public.nearby_member_ids(integer, integer) from public, anon;
grant execute on function public.nearby_member_ids(integer, integer) to authenticated;

comment on table public.profile_location_cells is 'Private coarse location cells used for optional nearby ordering; no precise coordinates.';
comment on function public.nearby_member_ids(integer, integer) is 'Returns verified, discoverable member IDs ordered by coarse proximity without revealing stored cells.';
