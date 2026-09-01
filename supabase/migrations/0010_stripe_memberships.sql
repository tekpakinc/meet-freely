alter table public.accounts
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists membership_status text not null default 'inactive'
    check (membership_status in ('inactive','active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused','complimentary')),
  add column if not exists membership_current_period_end timestamptz;

update public.accounts
set membership_status = 'complimentary'
where membership_active = true
  and stripe_subscription_id is null
  and membership_status = 'inactive';

create table if not exists public.stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;
create policy "stripe events are service-only" on public.stripe_events
  for all to public using (false) with check (false);

comment on table public.stripe_events is 'Private idempotency ledger for verified Stripe webhook events.';
comment on column public.accounts.membership_active is 'Server-managed entitlement. Never set from the browser.';
