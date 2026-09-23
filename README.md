# SciMentor

A private science mentoring portal built with **Next.js, TypeScript, React, Tailwind CSS, Supabase Auth, and PostgreSQL**. Deploy to Vercel or any host that runs a standard Next.js Node server.

## Features

- Availability published separately for each week, in Edmonton time.
- Online and in-person booking with a required in-person location and 72 hours’ notice.
- Database-enforced booking conflicts and single-use, email-bound mentee invites.
- Private mentor/mentee conversations, including private announcement replies.
- Group announcements, an email delivery queue, FAQs, and resources.

## Local setup

1. Install Node.js 22.13 or newer and run `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in your own values. Keep existing `.env` files private; `.env.local` takes precedence.
3. Create a Supabase project. Copy its project URL and publishable key from Project Settings → API.
4. In Supabase’s SQL editor, run `supabase/migrations/001_initial.sql` **once** against a new database. It creates the private `scimentor` schema, tables, indexes, and booking safeguards. Later changes must use new migrations.
5. Copy the **Transaction pooler** connection string from Supabase’s Connect dialog into `DATABASE_URL`. Use the actual host, username, and password shown there. Keep SSL certificate verification enabled (`sslmode=verify-full` for hosted connections).
6. In Supabase Auth, enable email sign-in. Set the **Magic Link email template** to include the sign-in code: `<p>Your SciMentor code is: {{ .Token }}</p>`. The app verifies this code directly; it does not use a callback link. Existing email users sign in with the same flow; new users are created on their first verified sign-in.
7. Configure Supabase’s Site URL for your deployment and configure production SMTP before inviting mentees. Supabase Auth sends login codes; Resend below sends announcements. These are separate email configurations.
8. Run `npm run dev` and open `http://127.0.0.1:5173`.

Without Supabase configuration, the welcome page still renders and the login page explains that sign-in is not connected. There is no simulated user or authentication bypass. Once connected, sign in, create your mentor space, and generate invite codes for your mentees’ email addresses.

Each account belongs to one mentoring space in this first version. Fellow mentors can create their own spaces. Mentees join with an invite code after verifying their email.

## Vercel deployment

1. Push your changes to GitHub yourself.
2. In Vercel, import the repository and select the **Next.js** framework preset.
3. Use the directory containing `package.json` as the Root Directory. This repository currently starts inside `portal`, so leave Vercel’s Root Directory at its default if `package.json` is at the GitHub repository root.
4. Add the values from `.env.example` in Vercel’s Environment Variables. `DATABASE_URL`, `RESEND_API_KEY`, and `EMAIL_JOB_SECRET` must remain server-only. Never add a `NEXT_PUBLIC_` prefix to secrets.
5. Deploy. Use Vercel’s supplied HTTPS URL as the Supabase Site URL.
6. Test sign-in with two accounts, mentor onboarding, invite redemption, bookings, and private replies before inviting the group.

Standard scripts are `npm run build` and `npm start`. Development and builds use Next.js’s supported webpack compiler to avoid a local Turbopack worker issue. Other Node hosts can run those same commands with the same environment variables. No special Vercel configuration file is required.

## Announcement email

Set `RESEND_API_KEY` and `EMAIL_FROM` (a verified sender). Publishing saves an announcement and a separate email job per joined mentee atomically. If email is not configured, the UI reports queued delivery. Invite codes are displayed for you to share; creating an invite does not email anyone.

The server attempts announcement delivery immediately and offers a manual retry. For unattended processing, an external scheduler can POST `/api/email-jobs` with `Authorization: Bearer <EMAIL_JOB_SECRET>`. A scheduler has not been provisioned. Leases and provider idempotency keys guard against duplicate sends; uncertain deliveries older than 23 hours require review. “Sent” means accepted by the provider, not confirmed inbox delivery.

## Privacy and database design

All application tables live in the **private `scimentor` schema**, with no public grants and row-level security enabled. Browser clients cannot query these tables directly. The server uses `DATABASE_URL`; every API operation checks the verified Supabase user, their membership, their role, and the relevant conversation or booking participants. Do not grant browser roles access to this schema.

Availability changes and booking inserts lock the mentor group row within their transactions; database triggers check overlaps and the 72-hour rule. A unique partial index permits only one confirmed booking per slot. Existing booked availability cannot be withdrawn silently. Cancellation is explicit; rescheduling currently means cancelling and booking a new eligible slot.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

Tests run the actual SQL migration and application service against an isolated embedded PostgreSQL engine (PGlite). They cover timezone/DST rules, conflicts, transaction rollback, privacy, invite restrictions, announcement queueing, safe links, and private-schema permissions. They do not use your Supabase project or send real email. Production database connectivity and real email delivery need to be checked after you add your credentials.

The previous local preview data was backed up outside this repository before the database conversion; it is not automatically migrated into Supabase. The new database starts empty. Secrets, dependencies, build output, and local databases are ignored by Git.
