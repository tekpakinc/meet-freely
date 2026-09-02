-- Launch hardening: room-chat realtime, anti-spam limits, and immutable safety records.
create index if not exists room_messages_sender_recent_idx on public.room_messages(sender_id, created_at desc);
create index if not exists open_invitations_author_recent_idx on public.open_invitations(author_id, created_at desc);

create or replace function private.enforce_room_message_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.room_messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 8 then
    raise exception 'Please slow down before sending another room message.';
  end if;
  if (select count(*) from public.room_messages where sender_id = new.sender_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Hourly room message limit reached. Try again later.';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_room_message_limits() from public, anon, authenticated;
drop trigger if exists enforce_room_message_limits on public.room_messages;
create trigger enforce_room_message_limits before insert on public.room_messages for each row execute function private.enforce_room_message_limits();

create or replace function private.enforce_introduction_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sender_id = new.recipient_id then raise exception 'You cannot introduce yourself to yourself.'; end if;
  if (select count(*) from public.introductions where sender_id = new.sender_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Hourly introduction limit reached. Try again later.';
  end if;
  if (select count(*) from public.introductions where sender_id = new.sender_id and recipient_id = new.recipient_id and created_at > now() - interval '24 hours') >= 1 then
    raise exception 'You already introduced yourself to this member today.';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_introduction_limits() from public, anon, authenticated;
drop trigger if exists enforce_introduction_limits on public.introductions;
create trigger enforce_introduction_limits before insert on public.introductions for each row execute function private.enforce_introduction_limits();

create or replace function private.enforce_invitation_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.open_invitations where author_id = new.author_id and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Hourly invitation limit reached. Try again later.';
  end if;
  if (select count(*) from public.open_invitations where author_id = new.author_id and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Daily invitation limit reached. Try again tomorrow.';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_invitation_limits() from public, anon, authenticated;
drop trigger if exists enforce_invitation_limits on public.open_invitations;
create trigger enforce_invitation_limits before insert on public.open_invitations for each row execute function private.enforce_invitation_limits();

create or replace function private.protect_introduction_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.sender_id <> new.sender_id or old.recipient_id <> new.recipient_id or old.message <> new.message or old.created_at <> new.created_at then
    raise exception 'Introduction details cannot be changed.';
  end if;
  if old.state <> 'pending' or new.state not in ('accepted','passed','reported') then
    raise exception 'That introduction can no longer be changed.';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_introduction_update() from public, anon, authenticated;
drop trigger if exists protect_introduction_update on public.introductions;
create trigger protect_introduction_update before update on public.introductions for each row execute function private.protect_introduction_update();

create or replace function private.protect_direct_message_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.id <> new.id or old.conversation_id <> new.conversation_id or old.sender_id <> new.sender_id or old.recipient_id <> new.recipient_id or old.body <> new.body or old.created_at <> new.created_at then
    raise exception 'Message content cannot be changed.';
  end if;
  if old.read_at is not null and new.read_at is distinct from old.read_at then raise exception 'Read receipts cannot be changed.'; end if;
  return new;
end;
$$;
revoke all on function private.protect_direct_message_update() from public, anon, authenticated;
drop trigger if exists protect_direct_message_update on public.direct_messages;
create trigger protect_direct_message_update before update on public.direct_messages for each row execute function private.protect_direct_message_update();

create or replace function private.protect_verified_profile_age()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.age is distinct from new.age and exists (select 1 from public.accounts a where a.user_id = old.user_id and a.verification = 'verified') then
    raise exception 'Verified age cannot be edited from a profile.';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_verified_profile_age() from public, anon, authenticated;
drop trigger if exists protect_verified_profile_age on public.profiles;
create trigger protect_verified_profile_age before update on public.profiles for each row execute function private.protect_verified_profile_age();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_messages') then
    alter publication supabase_realtime add table public.room_messages;
  end if;
end $$;
