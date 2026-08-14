-- Members may correct or resubmit their own pending request.
-- WITH CHECK keeps the resulting state pending, so members cannot approve themselves.
drop policy if exists "members submit own verification" on public.verification_requests;

create policy "members submit own verification"
on public.verification_requests
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and status in ('unverified', 'failed', 'pending')
)
with check (
  (select auth.uid()) = user_id
  and status = 'pending'
  and adult_attested
  and birth_date <= current_date - interval '18 years'
);
