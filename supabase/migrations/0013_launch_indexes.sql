-- Cover moderation and messaging foreign keys and remove a duplicate index.
create index if not exists direct_messages_sender_id_idx
  on public.direct_messages (sender_id);

create index if not exists reports_reviewer_id_idx
  on public.reports (reviewer_id)
  where reviewer_id is not null;

drop index if exists public.open_invitations_author_recent_idx;
