alter table public.reports
  add column if not exists status text not null default 'open'
    check (status in ('open','reviewed','actioned','dismissed')),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewer_id uuid references auth.users(id);

create or replace function private.is_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) $$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create policy "admins read accounts" on public.accounts for select to authenticated using ((select private.is_admin()));
create policy "admins update accounts" on public.accounts for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins read profiles" on public.profiles for select to authenticated using ((select private.is_admin()));
create policy "admins read verification requests" on public.verification_requests for select to authenticated using ((select private.is_admin()));
create policy "admins update verification requests" on public.verification_requests for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins read reports" on public.reports for select to authenticated using ((select private.is_admin()));
create policy "admins update reports" on public.reports for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

grant select, update on public.accounts to authenticated;
grant select, update on public.verification_requests to authenticated;
grant select, update on public.reports to authenticated;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where id = (select user_id from public.profiles where username = 'Dapper91' limit 1);
