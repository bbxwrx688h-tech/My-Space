# My-Space

An internal Hebrew, right-to-left workplace app for MBT, MID and MARP. Employees reserve workstations by day and book the MID meeting room in Jerusalem time.

## Developer handoff

Home lists the signed-in employee’s upcoming organized and accepted meetings, daily workstation bookings and published offers. Workstations combines searching, offering and daily reservations. The calendar displays one Sunday–Thursday week at a time. The requests page contains meeting approvals, release and swap requests, and pending invitations. The admin-only user page manages roles, supervisors and meeting rooms.

### Roles and hierarchy

- A user can offer owned stations, book other employees’ stations and respond to meeting invitations. Users cannot create new room bookings. A legacy user can cancel their own existing meeting.
- A manager has the same station permissions and can request a meeting up to two weeks ahead. Their assigned boss or an admin must approve it. A manager may edit a meeting’s details directly, while a change to its time requires approval. Existing accounts can temporarily have no supervisor, but managers need an assigned boss to submit a request.
- A boss can book without an advance limit, override manager meetings after reviewing the affected meetings, and request a takeover of other bosses’ meetings. A boss can edit or cancel meetings belonging to their directly assigned managers. A boss cannot directly override another boss’s meeting.
- The local admin can manage roles and assign supervisors, create rooms, book without an advance limit, approve on behalf of all approvers and override bookings or pending holds after review. Users are assigned to managers and managers to bosses. Reassign direct reports before changing their supervisor’s role. A changed manager–boss assignment transfers pending manager requests to the new boss.
- AD FS is a placeholder. Only a trusted server-side integration may assert its name, surname and UPN claims. Development sign-in uses separate fixed test identities. The local admin uses a hashed password.

### Booking rules

- Stations have their own database IDs. Multiple stations may share a room. Offers use consecutive whole dates, including weekends, and borrowers can select individual days. One person can reserve one station per day across all sites. Owners can withdraw offered days, including booked days. Borrowers can release days. Changes and notices commit together.
- Meetings use 15-minute increments, Jerusalem time and Sunday–Thursday. Adjacent meetings may touch. Rooms have a site and name and can be added by an admin.
- A pending manager request holds its proposed time. A takeover request retains the existing meetings and holds the requested time. Every affected boss must approve, or an admin can approve for all. Rejection, cancellation or expiry releases the hold. Expiry is four days after creation or at the earliest requested start, whichever comes first. An approval checks the requester’s current role, supervisor, room availability and the versions and owners of all affected meetings.
- Bosses and admins can create daily working-day or weekly series. A series ends on an inclusive date or after a specified number of occurrences. All occurrences are checked together. Approvals for conflicts cover the full series. An authorized editor can change one occurrence or this and subsequent occurrences, and can cancel one, the remainder or the whole series.
- A private meeting’s title, description and visit flag are visible to its owner, invited employees who have not declined, the owner’s assigned supervisor and admins. Others see the owner, occupied time and a private-meeting label. An invitation is sent to registered users only and becomes accepted only after the recipient responds. The visit checkbox marks an ordinary meeting as part of a visit.
- Release and swap requests retain the existing meeting or meetings until the owner or owners approve, or an admin approves on their behalf. An approved release cancels the meeting and frees the room. An approved swap changes both meetings in one transaction after rechecking the versions, holds and room conflicts.
- PostgreSQL stores schedules, requests, daily station ownership, sessions and in-app notices. No Redis or email service is used. The interface refreshes after local changes and periodically while visible.

### Interface

The reference in [docs/design/home.png](docs/design/home.png) sets the home layout: a navigation bar, two booking panels and three personal activity lists. The current navy, steel blue, slate and mist palette is defined in `web/src/colors.ts`. Use MUI React components and the `sx` prop for UI styling. Keep page-specific styles with the component and reuse common spacing, surfaces, and control styles from `web/src/layout.ts`. The MUI theme in `web/src/main.tsx` supplies typography, colors, RTL support, and document defaults. The interface shows actual bookings and meaningful empty states.

## Run locally

Use Node 22.12 or later, npm and a UTF-8 PostgreSQL database. The verification environment used PostgreSQL 18. The runtime account needs permission to create tables, indexes and sequences in its application schema.

1. Create an empty application database and a separate test database on your PostgreSQL instance. For a local installation, use `createdb my_space` and `createdb my_space_test`.
2. Copy `.env.example` to `.env` on a fresh checkout. Set both connection URLs, the initial admin password, and a random confirmation secret. Generate the secret with `openssl rand -hex 32`. The local workspace already has an ignored `.env`.
3. Run `npm ci` followed by `npm run dev`. Open the Vite URL printed in the terminal, usually `http://127.0.0.1:5173`. The API runs at `http://127.0.0.1:3100`. Vite proxies `/api` to the API. Restart the API process after server edits.
4. Choose **כניסת פיתוח** and select a test employee. First sign-in opens onboarding. To assign a boss, sign in to **כניסת מנהל מערכת**, open **ניהול משתמשים**, and assign roles and supervisors. Only employees who have signed in appear. Test employees start with ordinary user permissions.
5. For a single-server build, run `npm run build` and `npm start`. Fastify serves the compiled frontend and API from the same origin. The server applies pending migrations on startup. You can also run `npm run migrate` explicitly.

### This machine’s preview

The ignored local configuration points to a private PostgreSQL cluster under `.local/postgres`. Its socket stays inside `.local/`. After a reboot run `pg_ctl -D .local/postgres -l .local/postgres.log start` from the project root, then `npm start`. The built preview is available at `http://127.0.0.1:3100`. On another machine, use the fresh-checkout steps above and that machine’s own database URLs.

### Configuration and deployment

| Setting                         | Purpose                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DATABASE_URL                    | Connection string for the application database.                                                                                                                                                   |
| TEST_DATABASE_URL               | Separate database for API and browser tests. Its account must be able to create schemas.                                                                                                          |
| HOST / PORT                     | Bind address and port. The defaults are loopback and 3100.                                                                                                                                        |
| NODE_ENV                        | Set to production behind the internal HTTPS reverse proxy. Production sessions use Secure cookies.                                                                                                |
| DEV_LOGIN                       | Enables the three fixed development identities in development/test. Production rejects both development logins and existing development sessions.                                                 |
| ADMIN_USERNAME / ADMIN_PASSWORD | Used to bootstrap the first local administrator. Startup preserves the existing salted password hash and role assignments. Choose a unique deployment password before initializing that database. |
| CONFIRMATION_SECRET             | Shared secret for signing short-lived meeting confirmations. All API instances must use the same value.                                                                                           |

Deploy `dist/`, `server/db/*.sql`, the package manifest and lockfile. Install runtime dependencies with `npm ci --omit=dev` and run from the project root. Keep the database on persistent storage with the office’s normal backup policy. For the AD FS integration, replace the placeholder in `server/features/auth/auth.controller.ts` with the organization’s redirect/callback flow. Validate the provider response on the server, then call `resolveIdentity('adfs', { name, surname, UPN })` followed by `signIn`. The identity adapter updates names on return visits and retains the employee’s role and bookings.

## Project map

The code is organized feature-first. Each server feature owns its HTTP controller, module, orchestration services and SQL repositories, while reusable domain workflows stay in their own directories. Each UI feature owns its pages, hooks and view components. Cross-cutting concerns live in `server/common/` and the shared helpers at the root of `web/src/`, and contracts shared by both sides live in `shared/`.

| Path                                                   | Responsibility                                                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/model.ts`                                      | Plain types used by the API and React UI.                                                                                                           |
| `shared/contracts/`                                    | Zod schemas for request validation, with inferred input types.                                                                                      |
| `shared/time.ts`                                       | Jerusalem business-date and slot helpers used on both sides.                                                                                        |
| `server/app.module.ts`                                 | Root Nest module that registers every feature module.                                                                                               |
| `server/main.ts`                                       | Bootstrap, global HTTP hooks, migrations and static-file serving.                                                                                   |
| `server/common/`                                       | Cross-cutting validation, notice copy, privacy helpers and the global module.                                                                       |
| `server/features/`                                     | Feature modules: `auth`, `workspace`, `stations` and `meetings`. Controllers stay thin; services hold orchestration and repositories own SQL reads. |
| `server/db/`                                           | Versioned SQL, connection pool, transaction handling and migrations.                                                                                |
| `server/auth/`, `server/meetings/`, `server/stations/` | Domain services: sessions and identity, schedule locking/approvals/release-swap, and station creation.                                              |
| `web/src/app/`                                         | Application shell, hash routing and workspace polling hooks.                                                                                        |
| `web/src/features/`                                    | UI features, including meeting calendar, dialog views and hooks.                                                                                    |
| `web/src/pages/`                                       | Sign-in, onboarding, home, stations, requests and admin pages.                                                                                      |
| `web/src/components/`                                  | Reusable form controls, date picker, account menu and station dialogs.                                                                              |
| `web/src/api.ts`, `endpoints.ts`                       | Generic fetch transport and typed endpoint functions grouped by feature.                                                                            |
| `web/src/dates.ts`, `layout.ts`, `colors.ts`           | Shared date helpers, style tokens and palette.                                                                                                      |
| `tests/`                                               | PostgreSQL-backed API tests and multi-account browser journeys.                                                                                     |

Admins add rooms from the user-management page. Room records are also created by versioned migrations when needed. All code that changes a meeting or a pending request must take the transaction-scoped schedule advisory lock used by `lockSchedule`, including future imports. Hierarchy changes take the same schedule lock before the hierarchy lock so approvals cannot race role or supervisor updates.

### How concurrent reservations work

A workstation’s offered dates live in `offer_days`. Its primary key protects the station and date, and a partial unique index protects the borrower and date across all sites. Reservation mutations lock selected dates in order. Withdrawing reserved days deletes the availability and saves the borrower notices in one transaction.

Meeting intervals are half-open. A request’s proposed slots remain held while its status is pending and its expiry is in the future. The schedule lock serializes creates, changes, approvals, expiry, releases and swaps across rooms. Approval records capture each required approver. Conflict snapshots and target meeting versions prevent a later approval from applying to changed data. Approval creates or updates every occurrence and cancels the approved conflicts in a single transaction. A changed meeting invalidates related pending requests. The expiry check runs on schedule operations and periodically while the server runs, and writes in-app notifications transactionally. The five-minute signed confirmation is used for direct override previews and must be reissued if affected versions change.

Employee-visible dates use dd/mm/yy and a 24-hour clock. A reservation date is a PostgreSQL date, independent of the browser’s timezone. Meeting timestamps are instants interpreted in Asia/Jerusalem. At the autumn clock change, an ambiguous meeting time selects its first occurrence. A meeting may end at 24:00. Other browser sessions refresh on focus and every 15 seconds while visible.

## Verification

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

`npm run check` runs typechecking, ESLint, the Prettier check, the production build and the API suite. Path aliases are available as `@server/*`, `@app/*` and `@shared/*`.

The API suite calls the actual Nest/Fastify routes against a fresh PostgreSQL schema. It covers authorization, AD FS claim mapping, session revocation, onboarding, competing bookings, partial withdrawal, edit collisions, approval holds, privacy, recurring series, release and swap requests, notifications and calendar boundaries. The browser suite drives sign-in, role changes, publishing, date selection, calendar requests, boss approvals, invitations and the personal activity lists. It also checks a narrow viewport. Each suite removes its own generated schema after execution. The browser test server uses loopback port 3191. Screenshots on failure are written to the ignored test-results directory.

Design references for the home, marketplace and calendar are in [docs/design](docs/design). Branding stays in English, and site and operating-system codes keep their original spelling. Employee-facing navigation, forms, date pickers, notices and errors use Hebrew.

### Calendar email integration placeholder

Run `npm run preview:calendar-mail` to print an example JSON payload. This is a preview only: it does not send email or run automatically when meetings are booked. The future service endpoint is `<CALENDAR_MAIL_API_URL>/Mail/send/calender`; `CALENDAR_MAIL_API_URL`, `CALENDAR_MAIL_API_KEY`, and `CALENDAR_MAIL_FROM` are reserved in `.env.example` for the integration. The authentication header and external API contract must be confirmed before implementing requests. The example uses `endTIme` exactly as provided; confirm this spelling with the API owner. The HTML includes an inline SVG logo, which some email clients may not render.

For deployment, inject `CALENDAR_MAIL_API_URL` and `CALENDAR_MAIL_FROM` from a ConfigMap, and `CALENDAR_MAIL_API_KEY` from a Secret. The application reads environment variables directly; an `.env` file is optional. Values already in the process environment take precedence over `.env`. The placeholder does not yet send requests or use the API key.
