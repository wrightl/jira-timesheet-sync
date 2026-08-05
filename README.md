# Jira Timesheet Sync

Next.js integration that receives **Jira Cloud worklog** webhooks (`created` / `updated` / `deleted`), maps Jira space keys to Bitmap client IDs, resolves Bitmap project/budget/user IDs, and posts timesheet entries to the Bitmap API.

## Features

- Public webhook endpoint secured with a shared secret header (`X-Webhook-Token`)
- Async webhook processing via Next.js `after()` (returns 202, syncs in background)
- Admin dashboard retry for failed/skipped sync events
- Email/password login with seeded admin and self-registration
- Role-based access: admins manage settings/cache/global mappings; users manage their own project/budget mappings
- Resolves Bitmap `project_id`, `project_budget_id`, and `user_id` from mapping + Bitmap APIs
- Optional per-user space → project/budget overrides (validated as active on sync)
- Caches Bitmap projects and project budgets for 24 hours
- Neon Postgres via Drizzle ORM
- Containerized for Kubernetes

## Quick start

```bash
cp .env.example .env.local
# Fill DATABASE_URL, JIRA_WEBHOOK_SECRET, SETTINGS_ENCRYPTION_KEY,
# ADMIN_EMAIL, ADMIN_PASSWORD

npm install
npm run db:push   # or npm run db:migrate against Neon
npm run db:seed   # creates/updates the admin user
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with the seeded admin (or register a normal user), then configure mappings and the Bitmap token under **Settings** (admin).

## Auth and roles

| Role | Capabilities |
|------|----------------|
| `admin` | Settings, cache, users, global space→client mappings, Jira↔Bitmap user mappings, sync dashboard |
| `user` | Own space→project/budget mappings (`/my-mappings`); read global spaces to pick from |

- Login username is the **email address**
- Self-register creates role `user` when `ALLOW_PUBLIC_REGISTER=true`; otherwise only admins create accounts via **Users**
- Seed admin: `npm run db:seed` using `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- Admin APIs use session cookies from login (no API key)

## User-specific mappings

On **My mappings**, a user picks a Jira space (from enabled global mappings), then a Bitmap project and budget. At sync time:

1. Resolve Bitmap user by Jira `author.displayName` ↔ Bitmap `full_name`
2. Match app user by `users.email` ↔ `user_mappings.bitmap_email` (case-insensitive)
3. If an enabled user-space mapping exists for that space, use it after checking the project is `active`+`started` and the budget has `billable_time_remaining > 0`
4. Otherwise auto-pick project/budget as before

If a mapped project/budget is inactive, the sync **fails** (no silent fallback).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | Neon direct URL for migrations |
| `JIRA_WEBHOOK_SECRET` | Shared secret sent as the `X-Webhook-Token` request header |
| `INTERNAL_PM_ACCESS_TOKEN` | Optional env fallback for the Bitmap API bearer token |
| `INTERNAL_PM_BASE_URL` | Bitmap API base URL (default `https://bitmap.app`) |
| `SETTINGS_ENCRYPTION_KEY` | Encrypts tokens saved via the UI |
| `ALLOW_PUBLIC_REGISTER` | Set `true` to allow `POST /api/auth/register` (default off) |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` (default: `debug` locally, `info` in production) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeded admin credentials (`npm run db:seed`) |
| `NGROK_AUTHTOKEN` | ngrok auth token for local webhook tunneling |
| `NGROK_DOMAIN` | Optional reserved ngrok domain |

Bitmap token resolution: encrypted token in Settings (DB) first; if unset, `INTERNAL_PM_ACCESS_TOKEN` is used as bootstrap. Once a token is saved in Settings, the DB value is the source of truth.

`.env.local` is gitignored. Commit only `.env.example`.

## Local webhook testing with ngrok

Jira Cloud must reach your laptop over HTTPS. Use ngrok while developing:

1. Create an auth token at the [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken) and set `NGROK_AUTHTOKEN` in `.env.local` (optionally set `NGROK_DOMAIN` if you have a reserved domain).
2. Start the app and tunnel together:

```bash
npm run dev:tunnel
```

   Or run `npm run dev` in one terminal and `npm run tunnel` in another after the app is up.
3. Copy the printed **Jira webhook URL** (`https://…/api/webhooks/jira`) into Jira.
4. Requests must include header `X-Webhook-Token: <JIRA_WEBHOOK_SECRET>` (same value as in `.env.local`).

## Jira Cloud webhook setup

1. In Jira: **Settings → System → WebHooks → Create** (or deliver via a path that can set headers).
2. URL: `https://<your-public-host>/api/webhooks/jira`
3. Ensure deliveries include `X-Webhook-Token: <JIRA_WEBHOOK_SECRET>`
4. Events: **Worklog created**, **Worklog updated**, **Worklog deleted**
5. Leave JQL empty so **all spaces** emit events

## Bitmap resolution

On each create/update sync:

1. Look up space → `client_id` mapping
2. Resolve Bitmap user via stored display-name mapping, or `GET /api/v1/users.json`
3. Apply user-specific project/budget override when matched and active; else auto-select
4. `POST /api/v1/timesheet_entries` with resolved IDs, `date` (`yyyy-MM-dd`), and `hours` (`timeSpentSeconds / 3600`)

## Async webhooks and retry

`POST /api/webhooks/jira` authenticates, stores a `pending` sync row (including the raw payload), and returns **202** immediately. Bitmap processing continues via Next.js [`after()`](https://nextjs.org/docs/app/api-reference/functions/after). The dashboard shows `pending` / `synced` / `skipped` / `failed` and polls while any row is pending.

Admins and owning users can **Retry** failed or skipped events (`POST /api/syncs?action=retry&id=`). Retry uses a compare-and-set claim on `failed`/`skipped` rows. Retry requires a stored raw payload (events accepted after this feature). Stuck `pending` rows older than 15 minutes are reclaimed on the next webhook accept.

## Debugging sync / missing mappings

Structured logs go to stdout (local terminal and [Vercel Runtime Logs](https://vercel.com/docs/runtime-logs)). Production emits one JSON object per line; development prints compact readable lines.

Watch for these messages when a worklog does not sync:

| Log message / `reason` | Meaning |
|------------------------|---------|
| `no_mapping` / `missing_space_key` | No enabled space → client mapping (or payload lacked a space key) |
| `mapping_disabled` | Space mapping exists but is disabled |
| `no_bitmap_user_match` / `user_mapping_disabled` | Author could not be resolved to a Bitmap user |
| `no_active_project` / `no_suitable_budget` | Client default path failed to pick project/budget |
| `user_space_*` | User-specific project/budget override is invalid or inactive |

Local tip: leave `LOG_LEVEL` unset (or set `debug`) while using `npm run dev` / `npm run tunnel` so resolver breadcrumbs like `client_default_path` appear. On Vercel, filter Runtime Logs by `worklog-sync`, `bitmap-resolver`, or `webhook/jira`.

## API

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/webhooks/jira` | Header `X-Webhook-Token` (returns 202; processes via `after()`) |
| `POST` | `/api/auth/register` | Public when `ALLOW_PUBLIC_REGISTER=true` |
| `POST` | `/api/auth/login` | Public |
| `POST` | `/api/auth/logout` | Session |
| `GET` | `/api/auth/me` | Session |
| `GET` | `/api/mappings` | Any authenticated (write = admin) |
| `GET/POST/PATCH/DELETE` | `/api/user-space-mappings` | Session (own rows; admin can manage any) |
| `GET` | `/api/bitmap/projects` | Session |
| `GET` | `/api/bitmap/budgets` | Session |
| `GET/POST/PATCH/DELETE` | `/api/user-mappings` | Admin |
| `GET/POST/PATCH/DELETE` | `/api/users` | Admin (app account maintenance) |
| `GET/DELETE` | `/api/cache` | Admin |
| `GET/PUT` | `/api/settings` | Admin |
| `GET` | `/api/syncs` | Session (admins see all; users see own) |
| `POST` | `/api/syncs?action=retry&id=` | Session (admin or owner) |
| `GET` | `/api/health` | None |

## Architecture

```
API routes / pages / scripts
  → services (domain orchestration)
    → repositories (Drizzle only)
      → Neon Postgres
  → clients/bitmap-http (Bitmap HTTP transport)
  → lib (validators, crypto, auth HTTP helpers, env, pure helpers)
```

- **Repositories** (`src/repositories/`): sole place that imports `drizzle-orm` / schema tables.
- **Services** (`src/services/`): business logic; injectable via factories for tests.
- **Lib** (`src/lib/`): pure helpers, Zod validators, cookie auth wrappers, typed env.
- Neon HTTP has no multi-statement transactions; use single-statement CAS (`WHERE` claims) for concurrency-sensitive updates.

## Scripts

```bash
npm run dev
npm run dev:tunnel
npm run tunnel
npm run build && npm start
npm test
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:seed
npm run db:backfill-authors
```
## Docker / Kubernetes

See `k8s/` manifests. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the secret, then run migrations and `npm run db:seed` (or an init job) before first login.
