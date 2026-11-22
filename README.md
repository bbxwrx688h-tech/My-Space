# My-Space

An internal Hebrew, right-to-left workplace app for MBT, MID and MARP. Employees reserve workstations by day and book the MID meeting room in Jerusalem time.

## Developer handoff

The application has three destinations. Home lists the signed-in employee’s upcoming meetings, daily workstation bookings and published offers. Workstations combines search, offering and daily reservations. The room calendar shows two Sunday–Thursday weeks and supports navigation in both directions. Account, administration and notifications open within these pages.

### Booking rules

* A workstation belongs to an employee and has its own database ID. Its site, room, operating system, owner name and description identify it to people. Multiple computers may have the same room or description. Employees can add stations after onboarding.
* An offer publishes whole local dates, including Friday and Saturday. Search includes partial matches. Employees explicitly choose a subset. One person can reserve one station per day across all sites. Owners can withdraw any published days, including reserved ones. Borrowers can release individual days. A withdrawal and its notification commit together.
* Rooms are database records. MID has the first room. Meeting intervals use 15-minute increments and adjacent meetings may touch. Regular employees and admins can book through the same local date next calendar month (clamped at month end). Bosses can book further ahead.
* A boss reviews every affected meeting before displacement. Any overlap cancels the whole displaced meeting. Editing or cancelling someone else’s meeting also requires review. Another current boss’s meeting triggers the named warning and a five-second wait enforced by the API. A changed conflict requires a new review. A moved meeting keeps its original organizer.
* Local admin signs in using a password and can change employee roles. Admin reservations follow ordinary employee rules. AD FS supplies name, surname and UPN. Only a trusted server integration may assert those claims. Development sign-in uses separate, fixed test identities.
* PostgreSQL stores the schedule, daily ownership, sessions and notices. Transactions and uniqueness constraints decide simultaneous requests. The application refreshes after local changes and periodically while open. No Redis or external notification worker is needed.

### Interface

The reference in [docs/design/home.png](docs/design/home.png) sets the home layout: a navigation bar, two booking panels and three personal activity lists. The current navy, steel blue, slate and mist palette is defined in `web/src/colors.ts`. Use MUI React components and the `sx` prop for UI styling. Keep page-specific styles with the component and reuse common spacing, surfaces, and control styles from `web/src/layout.ts`. The MUI theme in `web/src/main.tsx` supplies typography, colors, RTL support, and document defaults. The interface shows actual bookings and meaningful empty states.

## Run locally

Use Node 22.12 or later, npm and a UTF-8 PostgreSQL database. The verification environment used PostgreSQL 18. The runtime account needs permission to create tables, indexes and sequences in its application schema.

1. Create an empty application database and a separate test database on your PostgreSQL instance. For a local installation, use `createdb my_space` and `createdb my_space_test`.
2. Copy `.env.example` to `.env` on a fresh checkout. Set both connection URLs, the initial admin password, and a random confirmation secret. Generate the secret with `openssl rand -hex 32`. The local workspace already has an ignored `.env`.
3. Run `npm ci` followed by `npm run dev`. Open the Vite URL printed in the terminal, usually `http://127.0.0.1:5173`. The API runs at `http://127.0.0.1:3100`. Vite proxies `/api` to the API. Restart the API process after server edits.
4. Choose **כניסת פיתוח** and select a test employee. First sign-in opens onboarding. To assign a boss, sign in to **כניסת מנהל מערכת**, open **החשבון שלי**, and change the employee’s role. Only employees who have signed in appear. Test employees start with ordinary user permissions.
5. For a single-server build, run `npm run build` and `npm start`. Fastify serves the compiled frontend and API from the same origin. The server applies pending migrations on startup. You can also run `npm run migrate` explicitly.

### This machine’s preview

The ignored local configuration points to a private PostgreSQL cluster under `.local/postgres`. Its socket stays inside `.local/`. After a reboot run `pg_ctl -D .local/postgres -l .local/postgres.log start` from the project root, then `npm start`. The built preview is available at `http://127.0.0.1:3100`. On another machine, use the fresh-checkout steps above and that machine’s own database URLs.

### Configuration and deployment

| Setting | Purpose |
| --- | --- |
| DATABASE_URL | Connection string for the application database. |
| TEST_DATABASE_URL | Separate database for API and browser tests. Its account must be able to create schemas. |
| HOST / PORT | Bind address and port. The defaults are loopback and 3100. |
| NODE_ENV | Set to production behind the internal HTTPS reverse proxy. Production sessions use Secure cookies. |
| DEV_LOGIN | Enables the three fixed development identities in development/test. Production rejects both development logins and existing development sessions. |
| ADMIN_USERNAME / ADMIN_PASSWORD | Used to bootstrap the first local administrator. Startup preserves the existing salted password hash and role assignments. Choose a unique deployment password before initializing that database. |
| CONFIRMATION_SECRET | Shared secret for signing short-lived meeting confirmations. All API instances must use the same value. |

Deploy `dist/`, `server/db/*.sql`, the package manifest and lockfile. Install runtime dependencies with `npm ci --omit=dev` and run from the project root. Keep the database on persistent storage with the office’s normal backup policy. For the AD FS integration, replace the placeholder in `server/auth/auth.controller.ts` with the organization’s redirect/callback flow. Validate the provider response on the server, then call `resolveIdentity('adfs', { name, surname, UPN })` followed by `signIn`. The identity adapter updates names on return visits and retains the employee’s role and bookings.

## Project map

| Path | Responsibility |
| --- | --- |
| `shared/model.ts` | Types used by the API and React UI. |
| `server/auth/` | Login options, session cookies, AD FS adapter boundary and local password verification. |
| `server/db/` | Versioned SQL, connection pool, transaction handling and bootstrap. |
| `server/meetings/` | Jerusalem time validation, room-level locking and signed override reviews. |
| `server/stations/` | Station registration, publishing and daily reservation changes. |
| `server/workspace.controller.ts` | Home/marketplace reads, onboarding, notifications and role management. |
| `web/src/pages/` | Sign-in, onboarding and the three main destinations. |
| `web/src/components/` | Hebrew date picker, booking dialogs, account controls and shared fields. |
| `tests/` | PostgreSQL-backed API tests and multi-account browser journeys. |

To add a room, add a numbered SQL migration alongside the first migration, for example `INSERT INTO rooms(site,name) VALUES ('MBT','חדר ישיבות צפוני');`. The calendar reads the room list from PostgreSQL. Every meeting writer must use the transactional room-booking path, including future import jobs.

### How concurrent reservations work

A workstation’s offered dates live in `offer_days`. Its primary key protects the station and date, and a partial unique index protects the borrower and date across all sites. Reservation mutations lock selected dates in order. Withdrawing reserved days deletes the availability and saves the borrower notices in one transaction. When the UI learns that another employee took a date, it requires a new selection.

The meeting service locks a room before reading its schedule. It tests overlaps as half-open intervals, so 09:00–10:00 and 10:00–11:00 fit together. A conflict preview changes no records. The server signs the requested action, employee ID, meeting IDs, versions, and organizers’ current roles. The confirm request validates those values against fresh data under the same lock. Confirmations expire after five minutes. A delayed browser tab cannot apply an obsolete review. The confirmation is permission to proceed after reading the warning; the application cannot establish whether colleagues spoke.

Employee-visible dates use dd/mm/yy and a 24-hour clock. A reservation date is a PostgreSQL date, independent of the browser’s timezone. Meeting timestamps are instants interpreted in Asia/Jerusalem. At the autumn clock change, an ambiguous meeting time selects its first occurrence. A meeting may end at 24:00. Other browser sessions refresh on focus and every 15 seconds while visible.

## Verification

```sh
npm ci
npm run build
npm run format:check
npm test
npx playwright install chromium
npm run test:e2e
```

The API suite calls the actual Nest/Fastify routes against a fresh PostgreSQL schema. It covers authorization, AD FS claim mapping, session revocation, onboarding, competing bookings, partial withdrawal, edit collisions, the protected override delay, notifications and calendar boundaries. The browser suite drives sign-in, role changes, publishing, date selection, calendar edits, protected overrides and the personal activity lists. It also checks a narrow viewport. Each suite removes its own generated schema after execution. The browser test server uses loopback port 3191. Screenshots on failure are written to the ignored test-results directory.

Design references for the home, marketplace and calendar are in [docs/design](docs/design). Branding stays in English, and site and operating-system codes keep their original spelling. Employee-facing navigation, forms, date pickers, notices and errors use Hebrew.
