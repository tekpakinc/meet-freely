-- Repair orphaned auth users and make onboarding self-healing when the auth
-- signup trigger has not yet created the user's private account row.
insert into public.accounts (user_id)
select users.id
from auth.users as users
left join public.accounts as accounts on accounts.user_id = users.id
where accounts.user_id is null
on conflict (user_id) do nothing;

create or replace function private.ensure_current_member_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid := auth.uid();
begin
  if member_id is null then
    raise exception 'Please sign in again.';
  end if;

  insert into public.accounts (user_id)
  values (member_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function private.ensure_current_member_account() from public, anon;
grant execute on function private.ensure_current_member_account() to authenticated;

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
declare member_id uuid := auth.uid();
begin
  if member_id is null then raise exception 'Please sign in again.'; end if;
  if p_birth_date > current_date - interval '18 years' then raise exception 'Meet Freely is only available to adults age 18 and older.'; end if;
  if p_age < 18 or p_age > 120 then raise exception 'Please enter a valid birth date.'; end if;
  if p_preferred_min_age > p_preferred_max_age then raise exception 'Minimum preferred age must not exceed maximum preferred age.'; end if;

  perform private.ensure_current_member_account();

  insert into public.profiles (user_id,username,age,broad_area,interests,gender,interested_in,preferred_min_age,preferred_max_age,compatibility_mode,discoverable)
  values (member_id,p_username,p_age,p_broad_area,p_interests,nullif(p_gender,''),coalesce(p_interested_in,'{}'),p_preferred_min_age,p_preferred_max_age,p_compatibility_mode,true)
  on conflict (user_id) do update set
    username=excluded.username, age=excluded.age, broad_area=excluded.broad_area,
    interests=excluded.interests, gender=excluded.gender, interested_in=excluded.interested_in,
    preferred_min_age=excluded.preferred_min_age, preferred_max_age=excluded.preferred_max_age,
    compatibility_mode=excluded.compatibility_mode, updated_at=now();

  insert into public.verification_requests (user_id,adult_attested,birth_date,status,submitted_at,updated_at)
  values (member_id,true,p_birth_date,'pending',now(),now())
  on conflict (user_id) do update set adult_attested=true,birth_date=excluded.birth_date,status='pending',submitted_at=now(),updated_at=now()
  where public.verification_requests.status <> 'verified';
end;
$$;

revoke all on function public.complete_onboarding(text,integer,text,text[],date,text,text[],integer,integer,text) from public, anon;
grant execute on function public.complete_onboarding(text,integer,text,text[],date,text,text[],integer,integer,text) to authenticated;
