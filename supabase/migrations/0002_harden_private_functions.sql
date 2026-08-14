create schema if not exists private;

alter function public.is_verified_member(uuid) set schema private;
alter function public.create_private_account() set schema private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke all on function private.create_private_account() from public, anon, authenticated;
revoke all on function private.is_verified_member(uuid) from public, anon;
grant execute on function private.is_verified_member(uuid) to authenticated;

create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);
create index if not exists introductions_sender_id_idx on public.introductions (sender_id);
create index if not exists introductions_recipient_id_idx on public.introductions (recipient_id);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists reports_reported_id_idx on public.reports (reported_id);
