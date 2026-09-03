-- Keep onboarding atomic and room conversations scoped to members of that room.
create or replace function public.complete_onboarding(
  p_username text,
  p_age integer,
  p_broad_area text,
  p_interests text[],
  p_birth_date date,
  p_gender text default null,
  p_interested_in text[] default '{}',
  p_preferred_min_age integer default 18,
  p_preferred_max_age integer default 99,
  p_compatibility_mode text default 'suggested'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  member_id uuid := auth.uid();
begin
  if member_id is null then raise exception 'Please sign in again.'; end if;
  if p_birth_date > current_date - interval '18 years' then raise exception 'Meet Freely is only available to adults age 18 and older.'; end if;
  if p_age < 18 or p_age > 120 then raise exception 'Please enter a valid birth date.'; end if;
  if p_preferred_min_age > p_preferred_max_age then raise exception 'Minimum preferred age must not exceed maximum preferred age.'; end if;

  insert into public.profiles (
    user_id, username, age, broad_area, interests, gender, interested_in,
    preferred_min_age, preferred_max_age, compatibility_mode, discoverable
  ) values (
    member_id, p_username, p_age, p_broad_area, p_interests, nullif(p_gender, ''),
    coalesce(p_interested_in, '{}'), p_preferred_min_age, p_preferred_max_age,
    p_compatibility_mode, false
  )
  on conflict (user_id) do update set
    username = excluded.username,
    age = excluded.age,
    broad_area = excluded.broad_area,
    interests = excluded.interests,
    gender = excluded.gender,
    interested_in = excluded.interested_in,
    preferred_min_age = excluded.preferred_min_age,
    preferred_max_age = excluded.preferred_max_age,
    compatibility_mode = excluded.compatibility_mode,
    updated_at = now();

  insert into public.verification_requests (
    user_id, adult_attested, birth_date, status, submitted_at, updated_at
  ) values (
    member_id, true, p_birth_date, 'pending', now(), now()
  )
  on conflict (user_id) do update set
    adult_attested = true,
    birth_date = excluded.birth_date,
    status = 'pending',
    submitted_at = now(),
    updated_at = now()
  where public.verification_requests.status <> 'verified';
end;
$$;

revoke all on function public.complete_onboarding(text,integer,text,text[],date,text,text[],integer,integer,text) from public, anon;
grant execute on function public.complete_onboarding(text,integer,text,text[],date,text,text[],integer,integer,text) to authenticated;

drop policy if exists "verified members read room chat" on public.room_messages;
create policy "room members read room chat"
on public.room_messages for select to authenticated
using (
  private.is_verified_member((select auth.uid()))
  and exists (
    select 1 from public.room_members own_membership
    where own_membership.room_id = room_messages.room_id
      and own_membership.user_id = (select auth.uid())
      and own_membership.state = 'active'
  )
  and private.is_verified_member(sender_id)
  and not exists (
    select 1 from public.blocks
    where (blocker_id = (select auth.uid()) and blocked_id = sender_id)
       or (blocker_id = sender_id and blocked_id = (select auth.uid()))
  )
);

drop policy if exists "verified members write room chat" on public.room_messages;
create policy "room members write room chat"
on public.room_messages for insert to authenticated
with check (
  (select auth.uid()) = sender_id
  and private.is_verified_member((select auth.uid()))
  and exists (
    select 1 from public.room_members own_membership
    where own_membership.room_id = room_messages.room_id
      and own_membership.user_id = (select auth.uid())
      and own_membership.state = 'active'
  )
);
