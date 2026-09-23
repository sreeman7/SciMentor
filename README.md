# SciMentor

A private mentoring portal for weekly availability, online/in-person bookings, private conversations, group announcements, FAQs, and resources.

## Current delivery status

The local application is implemented and validated. A private Site was registered, but publication did not complete because the installed Sites publishing helper disappeared during the session. No production URL is available. Local preview data is separate from production.

## Implementation

TypeScript, React, Tailwind CSS, and Next.js-compatible routes running with Vinext on Sites. Persistence is Cloudflare D1 (SQLite), rather than the previously proposed Supabase/PostgreSQL. The private preview uses platform-owned ChatGPT sign-in; individual email-bound invite codes grant mentee membership. This is not standalone email/password authentication.

Each account belongs to one mentoring space in this first release. A mentor can create their own separate space. A mentee redeems a single-use code, valid for seven days, while signed in with the matching email. Only code hashes are stored. Hosted access remains owner-private until sharing is deliberately configured; invite codes do not override the hosting access policy.

## Run locally

Use Node 22.13+ (Node 25 used for validation) and `npm ci`, then `npm run dev`. The development server prints its local URL. Local sign-in uses the bundled simulated identity; production authentication is dispatch-owned and does not include that mock.

D1 is declared in `.openai/hosting.json`. After `npm run build`, apply the first local migration once:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_worried_silk_fever.sql
```

Do not replay the migration. Hosted deployment applies and tracks migrations separately. Applied migrations and their Drizzle metadata are immutable. Future schema changes need a new migration. The first migration includes custom SQL triggers and a partial unique index; preserve those on future changes.

## Rules implemented

- Availability is published for specific dates, not a repeating weekly schedule. Blocks are divided into 15-, 30-, 45-, or 60-minute slots.
- All calendar entry and display uses America/Edmonton, including daylight-saving changes.
- Three days means 72 full hours. The API and database enforce the minimum notice.
- Database triggers reject overlapping availability and meeting conflicts; the partial unique index prevents two active bookings for one slot.
- In-person bookings require a typed location; online links are added by the mentor after booking.
- Availability with a confirmed booking cannot be removed until the meeting is explicitly cancelled.
- Rescheduling currently means cancelling and booking a new eligible slot. No cancellation deadline was assumed.
- Every API read/write checks group membership and role. Mentees receive only their own bookings/messages and their mentor’s profile, not other mentees’ identities or conversations.
- Announcement replies go to the mentee’s private conversation. Announcements and published resources are group-visible.
- Mutation requests require a matching Origin and authenticated user. Private API responses are non-cacheable.

## Announcement email setup

Set RESEND_API_KEY (secret) and EMAIL_FROM (a verified sender) in hosted environment settings, then redeploy. `.env.example` lists the matching local keys. Never commit keys.

Publishing stores both the announcement and individual recipient jobs atomically. If configured, the server attempts delivery immediately. Without configuration, jobs remain pending and the UI says so. Retry is available to mentors. For automated processing/retries, configure an external scheduler to POST /api/email-jobs with `Authorization: Bearer <EMAIL_JOB_SECRET>`. That scheduler is not provisioned yet.

Leases prevent simultaneous processing and Resend idempotency keys protect retries. Uncertain deliveries older than 23 hours move to manual review rather than risking duplicates after the provider’s 24-hour window. See [Resend’s idempotency documentation](https://resend.com/changelog/idempotency-keys). “Sent” means accepted by the provider; delivery/bounce webhooks are not implemented.

## Verification

```sh
node node_modules/typescript/bin/tsc --noEmit
node --test tests/portal.test.mjs
npm run build
```

The tests use Node’s SQLite engine, the actual migration/triggers, and the application service code with isolated test identities. They cover notice boundaries, timezone/DST handling, booking races, cancellation authorization, rollback of overlapping availability, invite redemption, cross-group isolation, private announcement replies, per-recipient email queueing, and safe resource links. They do not contact the email provider.

## Before the mentee pilot

1. Create your mentor space and publish real weekly availability.
2. Connect a verified email sender and verify delivery to a test recipient.
3. Decide the hosting audience and invite the actual mentee accounts; the initial deployment is owner-private.
4. Collect approved FAQs/resources and add them in the portal.
5. Confirm the 72-hour interpretation, meeting durations, and cancellation policy.

Booking reminder emails, calendar integration, file uploads, week copying, meeting notes, and progress tracking are not part of this first implementation. No real mentee records are seeded. Browser agent navigation is optional; unsupported browsers work normally.
