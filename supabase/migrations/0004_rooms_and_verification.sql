-- Interest rooms, expiring invitations, room chat, and a reviewable verification request.
create type public.room_member_state as enum ('active', 'away', 'left');
create type public.invitation_state as enum ('open', 'closed', 'expired');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{3,48}$'),
  name text not null check (char_length(name) between 3 and 60),
  description text not null check (char_length(description) between 1 and 240),
  accent text not null default 'mint' check (accent in ('coral','sky','gold','plum','mint','rose')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state public.room_member_state not null default 'active',
  bubble_color text not null default 'mint' check (bubble_color in ('coral','sky','gold','plum','mint','rose')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.open_invitations (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  broad_area text check (char_length(broad_area) <= 80),
  state public.invitation_state not null default 'open',
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.verification_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  adult_attested boolean not null default false,
  birth_date date,
  status public.verification_state not null default 'unverified',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'unverified' or (adult_attested and birth_date <= current_date - interval '18 years'))
);

create index room_members_user_id_idx on public.room_members (user_id);
create index room_members_presence_idx on public.room_members (room_id, state, last_seen_at desc);
create index open_invitations_live_idx on public.open_invitations (room_id, expires_at desc) where state = 'open';
create index open_invitations_author_idx on public.open_invitations (author_id, created_at desc);
create index room_messages_recent_idx on public.room_messages (room_id, created_at desc);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.open_invitations enable row level security;
alter table public.room_messages enable row level security;
alter table public.verification_requests enable row level security;

create policy "anyone can list active room topics" on public.rooms for select to anon, authenticated using (active);
create policy "verified members see room presence" on public.room_members for select to authenticated using (
  private.is_verified_member((select auth.uid()))
  and private.is_verified_member(user_id)
  and not exists (select 1 from public.blocks where (blocker_id = auth.uid() and blocked_id = user_id) or (blocker_id = user_id and blocked_id = auth.uid()))
);
create policy "verified members manage own room presence" on public.room_members for insert to authenticated with check (
  (select auth.uid()) = user_id and private.is_verified_member((select auth.uid()))
);
create policy "members update own room presence" on public.room_members for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "members leave own rooms" on public.room_members for delete to authenticated using ((select auth.uid()) = user_id);

create policy "verified members see live invitations" on public.open_invitations for select to authenticated using (
  private.is_verified_member((select auth.uid()))
  and private.is_verified_member(author_id)
  and not exists (select 1 from public.blocks where (blocker_id = auth.uid() and blocked_id = author_id) or (blocker_id = author_id and blocked_id = auth.uid()))
);
create policy "verified members post invitations" on public.open_invitations for insert to authenticated with check (
  (select auth.uid()) = author_id and private.is_verified_member((select auth.uid())) and expires_at <= now() + interval '48 hours'
);
create policy "authors update invitations" on public.open_invitations for update to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy "authors delete invitations" on public.open_invitations for delete to authenticated using ((select auth.uid()) = author_id);

create policy "verified members read room chat" on public.room_messages for select to authenticated using (
  private.is_verified_member((select auth.uid()))
  and private.is_verified_member(sender_id)
  and not exists (select 1 from public.blocks where (blocker_id = auth.uid() and blocked_id = sender_id) or (blocker_id = sender_id and blocked_id = auth.uid()))
);
create policy "verified members write room chat" on public.room_messages for insert to authenticated with check (
  (select auth.uid()) = sender_id and private.is_verified_member((select auth.uid()))
);

create policy "members see own verification" on public.verification_requests for select to authenticated using ((select auth.uid()) = user_id);
create policy "members create own verification" on public.verification_requests for insert to authenticated with check (
  (select auth.uid()) = user_id and status in ('unverified','pending')
);
create policy "members submit own verification" on public.verification_requests for update to authenticated
  using ((select auth.uid()) = user_id and status in ('unverified','failed'))
  with check ((select auth.uid()) = user_id and status = 'pending' and adult_attested);

grant select on public.rooms to anon, authenticated;
grant select, insert, update, delete on public.room_members to authenticated;
grant select, insert, update, delete on public.open_invitations to authenticated;
grant select, insert on public.room_messages to authenticated;
grant select, insert, update on public.verification_requests to authenticated;

insert into public.rooms (slug, name, description, accent) values
  ('things-to-do-tonight', 'Things to do tonight', 'Spontaneous plans and open evenings.', 'rose'),
  ('live-music', 'Live music', 'Shows, local bands, and concert company.', 'plum'),
  ('food-and-coffee', 'Food & coffee', 'New spots, old favorites, and casual meetups.', 'gold'),
  ('outdoors', 'Outdoors', 'Walks, hikes, parks, and fresh air.', 'mint'),
  ('books-and-art', 'Books & art', 'Galleries, bookstores, and creative conversation.', 'coral');
