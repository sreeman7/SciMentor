# SciMentor

A private mentoring portal for science mentors and mentees. Mentors publish weekly availability, manage meetings, share resources, and answer questions privately.

**Live website:** [sci-mentor.vercel.app](https://sci-mentor.vercel.app/)

SciMentor is an independent student project, not an official University of Alberta service.

## Features

- Separate mentoring spaces, with email-bound, single-use invitations that expire after seven days.
- Date-specific availability in Edmonton time, with a minimum booking notice of 72 hours.
- Online and in-person meetings; in-person bookings require a location.
- Rescheduling that keeps the original booking if the replacement fails.
- Mentor-managed meeting links and explicit meeting cancellation.
- Private conversations and private replies to group announcements.
- Unread message counts, mentee activity, and reminders for missing meeting links.
- Suspension and restoration of mentee access, with history preserved.
- Searchable FAQs and resources, plus optional announcement email delivery.

## Technology

| Area | Tools |
| --- | --- |
| Frontend | React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Next.js route handlers and server-side TypeScript |
| Database | Supabase PostgreSQL through `pg` |
| Authentication | Supabase email verification codes |
| Hosting | Vercel, or a host supporting Next.js |
| Tests | Node.js test runner and PGlite PostgreSQL |

## Repository structure

The frontend and backend are organized separately inside one Next.js application. They share one package file and deploy together. Run commands from the directory containing `package.json`.

```text
.
├── app/                        # Next.js routing and server-rendered page entry points
│   ├── api/                    # Thin exports for backend HTTP handlers
│   ├── auth/signout/           # Sign-out route
│   ├── login/                  # Login page entry point
│   ├── layout.tsx              # Metadata and global layout
│   └── page.tsx                # Selects welcome page or authenticated portal
├── frontend/
│   ├── pages/                  # Portal, welcome page, and sign-in form
│   ├── components/             # Dashboard components and reusable UI
│   ├── hooks/                  # Browser/UI hooks
│   ├── lib/                    # Dashboard calculations and styling utilities
│   └── styles/                 # Global styles and Tailwind setup
├── backend/
│   ├── handlers/               # Auth, portal, sign-out, and email-job HTTP handlers
│   ├── services/               # Portal business rules and announcement delivery
│   ├── db/                     # PostgreSQL connection, TLS, and query adapter
│   ├── auth.ts                # Verified Supabase identity and cookie handling
│   └── request-origin.ts      # Same-origin request checks
├── shared/                     # Types and rules used by both layers
├── supabase/migrations/        # Ordered PostgreSQL schema migrations
├── tests/                      # Service, privacy, booking, and origin-check tests
├── public/                     # Public static assets
├── vendor/                     # Third-party styles and their license
├── proxy.ts                    # Supabase session refresh
└── .env.example                # Configuration names without credentials
```

**Where to edit:** change screens in `frontend/pages`, reusable controls in `frontend/components`, permissions and booking behavior in `backend/services/portal.ts`, and API responses in `backend/handlers`. Keep database credentials and server integrations in the backend. `shared/` contains only code safe to import in either layer. The `app/` directory connects these layers to Next.js URLs.

## Run locally

1. Install Node.js 22.13 or newer.
2. Install dependencies:

   ```bash
   npm ci
   ```

3. For a new checkout, copy `.env.example` to `.env.local` and fill in the required values below. Keep an existing `.env.local`; do not overwrite working credentials.
4. Prepare Supabase using the next section.
5. Start the application:

   ```bash
   npm run dev
   ```

6. Open [localhost on port 5173](http://127.0.0.1:5173).

Both frontend and backend run through this one command. Development and builds use the Next.js webpack compiler.

## Environment variables

Store local values in `.env.local`. Add production values in Vercel's project settings. `.env.local` is ignored by Git.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase browser-safe publishable key |
| `DATABASE_URL` | Yes | Server-only transaction-pooler connection string |
| `DATABASE_SSL_CA_BASE64` | For this Supabase setup | Base64-encoded root CA certificate for verified TLS |
| `RESEND_API_KEY` | No | Sends announcement emails through Resend |
| `EMAIL_FROM` | With Resend | Sender verified in Resend |
| `EMAIL_JOB_SECRET` | With an external scheduler | Protects the announcement email-job endpoint |

The `NEXT_PUBLIC_` values are intentionally available to the browser. Never give database passwords or email credentials that prefix. Hosted database connections verify certificates and hostnames; download the root CA from Supabase's Database Settings → SSL Configuration and base64-encode its contents for `DATABASE_SSL_CA_BASE64`.

## Supabase setup

### Database

For a new database, run these files in the Supabase SQL editor, in order:

1. `supabase/migrations/001_initial.sql` — private schema, tables, and booking safeguards.
2. `supabase/migrations/002_message_reads.sql` — message read tracking.
3. `supabase/migrations/003_member_access.sql` — suspension, restoration, and related database safeguards.

For an existing database, run only migrations that have not been applied. Do not rerun migration 001. Moving the code into frontend and backend folders requires no database migration.

Copy the **Transaction pooler** connection string from Supabase's **Connect** dialog into `DATABASE_URL`. Use the same Supabase project for the URL, publishable key, and database connection.

### Sign-in emails

1. Enable the Email provider under **Authentication → Sign In / Providers**.
2. Configure your sending provider under **Authentication → Emails → SMTP Settings**. SMTP credentials belong in Supabase, not in the website's frontend or GitHub.
3. In both **Confirm sign up** and **Magic link or OTP** email templates, include the verification code:

   ```html
   <h2>Your SciMentor sign-in code</h2>
   <p>Enter this code on the website:</p>
   <h1>{{ .Token }}</h1>
   <p>If you did not request this, ignore this email.</p>
   ```

4. Set **Authentication → URL Configuration → Site URL** to the website address. For local development, use `http://127.0.0.1:5173`; for production, use the deployed HTTPS URL.

The app verifies the code directly. New users and existing users use the same sign-in form. Each account belongs to one mentoring space: mentors create a space, and mentees join with an invite tied to their verified email.

## Deploy to Vercel

1. Commit and push the desired changes to GitHub.
2. Import the GitHub repository into Vercel.
3. Choose **Next.js**. Keep the Root Directory at `./` when `package.json` is at the repository root; do not set it to `frontend` or `backend`.
4. Use `npm run build` as the build command and leave the output directory at the framework default.
5. Add the four Supabase/database variables above to the **Production** environment.
6. Deploy. After changing environment variables, redeploy for the changes to take effect.
7. Set the deployed HTTPS URL as the Supabase Auth Site URL.
8. Test the live sign-in and mentoring flows before inviting real mentees.

The Vercel–Supabase marketplace integration is optional. The app can use the existing Supabase project directly through its environment variables.

## Privacy and access

Application tables live in the private `scimentor` schema, with row-level security enabled and no public grants. Browsers access authorized server routes; they do not query these tables directly. The backend checks the verified identity, membership, role, and conversation or meeting participants.

Mentees can see their own meetings and private conversations. Group announcements are shared, but replies are private. Mentors see the members and activity in their own space.

Suspending a mentee blocks access, cancels future meetings, revokes unused invites for that email, and cancels queued announcements that have not entered delivery. Existing messages and meeting history are retained. Email already handed to a provider cannot be recalled. Restoring access does not reinstate cancelled meetings.

Database safeguards prevent double bookings and enforce notice requirements. Rescheduling cancels the old meeting and inserts the replacement in one atomic statement. The discussion topic carries over; a new online meeting link must be added for the new time.

## Optional announcement emails

Supabase SMTP sends **sign-in codes**. Resend sends **mentor announcements**. These are separate configurations.

With `RESEND_API_KEY` and a verified `EMAIL_FROM`, publishing an announcement attempts delivery to active mentees. Without them, the announcement still appears in the portal and email copies remain queued. Publishing and retrying later can send queued announcements.

For scheduled retries, configure an external scheduler to POST to `/api/email-jobs` with `Authorization: Bearer <EMAIL_JOB_SECRET>`. A scheduler is not included. Delivery jobs use leases and idempotency keys; uncertain deliveries older than the retry window require review. A sent status means the provider accepted the email, not that it reached the inbox.

## Checks and testing

```bash
npm run typecheck
npm test
npm run build
```

Tests run the actual service code and migrations against an isolated PGlite database. They cover booking conflicts, rescheduling rollback, privacy, invitations, unread messages, suspension/restoration, safe links, and request-origin validation. They do not use the live Supabase database or send email.

Before sharing the portal, test mentor sign-in, two separate mentee accounts, invitations, online and in-person bookings, rescheduling, private messages, and suspension/restoration on the deployed site. Confirm that neither mentee can see the other's private data.

## License

See [LICENSE](LICENSE). Third-party style licensing is preserved under `vendor/`.
