-- Inclusive profile identity and discovery preferences; existing profile RLS continues to protect these fields.
alter table public.profiles
  add column if not exists gender text check (gender is null or char_length(gender) between 1 and 40),
  add column if not exists interested_in text[] not null default '{}';

comment on column public.profiles.gender is 'Member-selected gender identity shown only to verified members allowed by profile RLS.';
comment on column public.profiles.interested_in is 'Member-selected genders they are open to meeting.';
