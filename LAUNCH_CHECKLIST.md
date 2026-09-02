# Meet Freely launch checklist

## Completed in the app

- Email/password authentication, confirmation, recovery, and persistent sessions
- Private profiles, photo uploads, profile editor, and verified-member visibility rules
- Interest rooms with live member counts, filters, room conversation, invitations, introductions, and direct messages
- Blocking and structured private safety reports
- Server-enforced message, invitation, and introduction rate limits
- Private approximate-proximity ordering without storing or exposing exact coordinates
- Stripe Checkout, webhook membership activation, billing state, and billing-management entry point
- Privacy, terms, community-guidelines, and safety pages
- Installable home-screen app, icons, social metadata, and custom domain

## Owner actions for the public soft launch

- [ ] Finish Stripe business verification and confirm payouts are enabled.
- [ ] Configure the Stripe Customer Portal to allow payment-method updates and subscription cancellation.
- [ ] Run one complete Stripe test-mode purchase, renewal, failed-payment, cancellation, and refund cycle with two test accounts.
- [ ] Connect production SMTP in Supabase Auth and test confirmation, recovery, and rate-limit behavior with Gmail, Outlook, and iCloud addresses.
- [x] Enforce a strong free in-app password policy for account creation and recovery. Supabase leaked-password protection requires its paid Pro plan and is intentionally not part of the free launch stack.
- [ ] Disable mandatory email confirmation in Supabase Auth so account creation immediately opens onboarding; retain email for recovery and essential account notices.
- [ ] Choose an adult-verification vendor or document the manual review procedure, evidence retention period, reviewer access, and appeal process.
- [ ] Assign a safety inbox owner and publish response targets for urgent reports, routine reports, appeals, and law-enforcement requests.
- [ ] Have a qualified attorney review the privacy policy, terms, age-verification flow, auto-renewal disclosures, and required state/country dating-service rules.
- [ ] Have two real devices test sign-up, confirmation links, photo upload, location permission denial, filtering, introductions, messaging, block/report, checkout, and cancellation.
- [ ] Add production monitoring for Supabase Auth, database, Edge Functions, Stripe webhooks, and the public domain.

Public registration can remain open while these items are completed, but unverified accounts must never enter rooms or contact members. Promote gradually until payment, email delivery, verification review, and safety-response handling have each been proven under real use.
