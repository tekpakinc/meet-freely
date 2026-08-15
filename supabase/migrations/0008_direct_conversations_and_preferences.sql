-- Accepted introductions become private, rate-limited conversations.
alter table public.profiles
  add column if not exists preferred_min_age integer not null default 18 check (preferred_min_age between 18 and 120),
  add column if not exists preferred_max_age integer not null default 99 check (preferred_max_age between 18 and 120),
  add column if not exists compatibility_mode text not null default 'suggested' check (compatibility_mode in ('suggested','strict'));

alter table public.profiles add constraint profiles_preferred_age_order check (preferred_min_age <= preferred_max_age);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  introduction_id uuid unique not null references public.introductions(id) on delete cascade,
  member_a uuid not null references auth.users(id) on delete cascade,
  member_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (member_a < member_b)
);
create index conversations_member_a_recent_idx on public.conversations(member_a,last_message_at desc);
create index conversations_member_b_recent_idx on public.conversations(member_b,last_message_at desc);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index direct_messages_conversation_recent_idx on public.direct_messages(conversation_id,created_at desc);
create index direct_messages_unread_idx on public.direct_messages(recipient_id,created_at desc) where read_at is null;
alter table public.conversations enable row level security;
alter table public.direct_messages enable row level security;
grant select on public.conversations to authenticated;
grant select,insert,update on public.direct_messages to authenticated;

create policy "participants view conversations" on public.conversations for select to authenticated using ((select auth.uid()) in (member_a,member_b));
create policy "participants view direct messages" on public.direct_messages for select to authenticated using (exists(select 1 from public.conversations c where c.id=conversation_id and (select auth.uid()) in (c.member_a,c.member_b)));
create policy "participants send direct messages" on public.direct_messages for insert to authenticated with check ((select auth.uid())=sender_id and private.is_verified_member((select auth.uid())) and exists(select 1 from public.conversations c where c.id=conversation_id and sender_id in (c.member_a,c.member_b) and recipient_id in (c.member_a,c.member_b)) and not exists(select 1 from public.blocks b where (b.blocker_id=sender_id and b.blocked_id=recipient_id) or (b.blocker_id=recipient_id and b.blocked_id=sender_id)));
create policy "recipients mark messages read" on public.direct_messages for update to authenticated using ((select auth.uid())=recipient_id) with check ((select auth.uid())=recipient_id);

create function private.open_conversation_after_accept() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state='accepted' and old.state is distinct from 'accepted' then
    insert into public.conversations(introduction_id,member_a,member_b) values(new.id,least(new.sender_id,new.recipient_id),greatest(new.sender_id,new.recipient_id)) on conflict(introduction_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.open_conversation_after_accept() from public,anon,authenticated;
create trigger open_conversation_after_intro_accept after update of state on public.introductions for each row execute function private.open_conversation_after_accept();

create function private.enforce_direct_message_limits() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (select count(*) from public.direct_messages where sender_id=new.sender_id and created_at>now()-interval '1 minute') >= 10 then raise exception 'Please slow down before sending another message.'; end if;
  if (select count(*) from public.direct_messages where sender_id=new.sender_id and created_at>now()-interval '1 hour') >= 100 then raise exception 'Hourly message limit reached. Try again later.'; end if;
  update public.conversations set last_message_at=now() where id=new.conversation_id;
  return new;
end;
$$;
revoke all on function private.enforce_direct_message_limits() from public,anon,authenticated;
create trigger enforce_direct_message_limits before insert on public.direct_messages for each row execute function private.enforce_direct_message_limits();

alter publication supabase_realtime add table public.direct_messages;
