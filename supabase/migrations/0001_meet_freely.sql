-- Meet Freely foundation: private-by-default profiles and member-only discovery.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.account_state as enum ('pending', 'active', 'paused', 'banned');
create type public.verification_state as enum ('unverified', 'pending', 'verified', 'failed');
create type public.introduction_state as enum ('pending', 'accepted', 'passed', 'reported');

create table public.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state public.account_state not null default 'pending',
  verification public.verification_state not null default 'unverified',
  membership_active boolean not null default false,
  birth_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references public.accounts(user_id) on delete cascade,
  username text unique not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  age integer check (age between 18 and 120),
  broad_area text check (char_length(broad_area) <= 80),
  bio text check (char_length(bio) <= 500),
  intentions text[] not null default '{}',
  interests text[] not null default '{}',
  discoverable boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.introductions (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  state public.introduction_state not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.blocks enable row level security;
alter table public.introductions enable row level security;
alter table public.reports enable row level security;

create function private.is_verified_member(member_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.accounts
    where user_id = member_id and state = 'active'
      and verification = 'verified' and membership_active = true
  );
$$;

create function private.create_private_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.accounts (user_id) values (new.id);
  return new;
end;
$$;

create trigger create_private_account_after_signup
after insert on auth.users
for each row execute function private.create_private_account();

revoke all on function private.create_private_account() from public, anon, authenticated;
revoke all on function private.is_verified_member(uuid) from public, anon;
grant execute on function private.is_verified_member(uuid) to authenticated;

create policy "accounts are private" on public.accounts for select using (auth.uid() = user_id);

create policy "owners view their profile" on public.profiles for select using (auth.uid() = user_id);
create policy "verified members discover profiles" on public.profiles for select using (
  discoverable and private.is_verified_member((select auth.uid())) and private.is_verified_member(user_id)
  and not exists (select 1 from public.blocks where (blocker_id = auth.uid() and blocked_id = user_id) or (blocker_id = user_id and blocked_id = auth.uid()))
);
create policy "owners create profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "owners update profile" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "members manage own blocks" on public.blocks for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
create policy "participants view introductions" on public.introductions for select using (auth.uid() in (sender_id, recipient_id));
create policy "verified members introduce themselves" on public.introductions for insert with check (
  (select auth.uid()) = sender_id and private.is_verified_member((select auth.uid()))
  and not exists (select 1 from public.blocks where (blocker_id = sender_id and blocked_id = recipient_id) or (blocker_id = recipient_id and blocked_id = sender_id))
);
create policy "recipients update introductions" on public.introductions for update using (auth.uid() = recipient_id);
create policy "members create reports" on public.reports for insert with check (auth.uid() = reporter_id);

-- Birth dates, verification details, and membership status never live in public profiles.
-- Add photos later in a private Storage bucket with matching verified-member policies.
