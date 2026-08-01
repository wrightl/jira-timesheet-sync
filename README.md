# Jira Timesheet Sync

Next.js integration that receives **Jira Cloud worklog** webhooks (`created` / `updated` / `deleted`), maps Jira space keys to Bitmap client IDs, resolves Bitmap project/budget/user IDs, and posts timesheet entries to the Bitmap API.

## Features

- Public webhook endpoint secured with a shared secret header (`X-Webhook-Token`)
- Site-wide webhook coverage (all spaces); sync only when a space → client mapping exists
- Resolves Bitmap `project_id`, `project_budget_id`, and `user_id` from mapping + Bitmap APIs
- Auto-creates Jira display name → Bitmap user mappings on first match
- Caches Bitmap projects and project budgets for 24 hours (view/invalidate in UI)
- Admin UI for space mappings, user mappings, cache, and the Bitmap access token
- Neon Postgres via Drizzle ORM
- Containerized for Kubernetes

## Quick start

```bash
cp .env.example .env.local
# Fill DATABASE_URL, JIRA_WEBHOOK_SECRET, SETTINGS_ENCRYPTION_KEY, ADMIN_API_KEY

npm install
npm run db:push   # or npm run db:migrate against Neon
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with `ADMIN_API_KEY`, then add mappings under **Mappings** and store the Bitmap token under **Settings**.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | Neon direct URL for migrations |
| `JIRA_WEBHOOK_SECRET` | Shared secret sent as the `X-Webhook-Token` request header |
| `INTERNAL_PM_ACCESS_TOKEN` | Optional env fallback for the Bitmap API bearer token |
| `INTERNAL_PM_BASE_URL` | Bitmap API base URL (default `https://bitmap.app`) |
| `SETTINGS_ENCRYPTION_KEY` | Encrypts tokens saved via the UI |
| `ADMIN_API_KEY` | Protects admin APIs and UI session |
| `NGROK_AUTHTOKEN` | ngrok auth token for local webhook tunneling |
| `NGROK_DOMAIN` | Optional reserved ngrok domain |

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
   Note: classic Jira admin webhooks cannot set custom headers—use this when calling via curl, a proxy, or another delivery path that can attach headers.

## Jira Cloud webhook setup

1. In Jira: **Settings → System → WebHooks → Create** (or deliver via a path that can set headers).
2. URL: `https://<your-public-host>/api/webhooks/jira` (use the ngrok host while testing locally)
3. Ensure deliveries include `X-Webhook-Token: <JIRA_WEBHOOK_SECRET>`
4. Events: **Worklog created**, **Worklog updated**, **Worklog deleted**
5. Leave JQL empty so **all spaces** emit events (integration on by default; unmapped spaces are skipped)

## Bitmap resolution

On each create/update sync:

1. Look up space → `client_id` mapping
2. Resolve Bitmap user via stored display-name mapping, or `GET /api/v1/users.json` matching `full_name` to Jira `author.displayName` (then persist the mapping)
3. Load client projects (`POST /api/v1/projects.json`, cached 24h) and pick the first with `state === "active"` and `started === true`
4. Load project budgets (`POST .../project_budgets`, cached 24h); prefer **QA** or **Development** by job title (`QA` in title → QA, else Development); otherwise first budget with `billable_time_remaining > 0`
5. `POST /api/v1/timesheet_entries` with resolved IDs, `date` (`yyyy-MM-dd`), and `hours` (`timeSpentSeconds / 3600`)

## API

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/webhooks/jira` | Header `X-Webhook-Token` matching `JIRA_WEBHOOK_SECRET` |
| `GET/POST/PATCH/DELETE` | `/api/mappings` | `Authorization: Bearer <ADMIN_API_KEY>` or admin cookie |
| `GET/POST/PATCH/DELETE` | `/api/user-mappings` | Admin |
| `GET/DELETE` | `/api/cache` | Admin (`?id=` or `?all=1` to invalidate) |
| `GET/PUT` | `/api/settings` | Admin |
| `GET` | `/api/syncs` | Admin |
| `GET` | `/api/health` | None |

## Scripts

```bash
npm run dev
npm run dev:tunnel   # Next.js + ngrok
npm run tunnel       # ngrok only (app already running)
npm run build && npm start
npm test
npm run db:generate
npm run db:migrate
npm run db:push
```

## Docker

```bash
docker build -t jira-timesheet-sync:latest .
docker compose up --build
```

## Kubernetes

Manifests are under `k8s/`:

```bash
kubectl apply -f k8s/secret.yaml   # edit secrets first
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml  # set your host / TLS
```

Point Jira at the public ingress URL for `/api/webhooks/jira`.

## Internal PM / Bitmap client

`src/clients/internal-pm.ts` implements the Bitmap HTTP client. `src/services/bitmap-resolver.ts` resolves user/project/budget IDs and builds the timesheet payload used by `src/services/worklog-sync.ts`.
