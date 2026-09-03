-- A deleted auth user can retain a valid access-token JWT until it expires.
-- Reject that stale identity with a clear error before attempting the FK insert.
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

  if not exists (select 1 from auth.users where id = member_id) then
    raise exception 'This account no longer exists. Please sign in again or create a new account.';
  end if;

  insert into public.accounts (user_id)
  values (member_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function private.ensure_current_member_account() from public, anon;
grant execute on function private.ensure_current_member_account() to authenticated;
