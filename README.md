# Jira Timesheet Sync

Next.js integration that receives **Jira Cloud worklog** webhooks (`created` / `updated` / `deleted`), maps Jira space keys to client IDs, and syncs timesheet entries to an internal project management API (stubbed for now).

## Features

- Public webhook endpoint secured with a shared secret header (`X-Webhook-Token`)
- Site-wide webhook coverage (all spaces); sync only when a space → client mapping exists
- Admin UI to manage mappings and the internal PM access token
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

Open [http://localhost:3000](http://localhost:3000), sign in with `ADMIN_API_KEY`, then add mappings under **Mappings** and optionally store the PM token under **Settings**.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | Neon direct URL for migrations |
| `JIRA_WEBHOOK_SECRET` | Shared secret sent as the `X-Webhook-Token` request header |
| `INTERNAL_PM_ACCESS_TOKEN` | Optional env fallback for the PM API token |
| `INTERNAL_PM_BASE_URL` | Base URL for the future real PM client |
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

## API

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/webhooks/jira` | Header `X-Webhook-Token` matching `JIRA_WEBHOOK_SECRET` |
| `GET/POST/PATCH/DELETE` | `/api/mappings` | `Authorization: Bearer <ADMIN_API_KEY>` or admin cookie |
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

## Internal PM client

`src/clients/internal-pm.ts` exposes `InternalPmClient` with a **stub** implementation. Replace `StubInternalPmClient` / `createInternalPmClient` with a real HTTP client when the PM API is ready—sync orchestration in `src/services/worklog-sync.ts` stays the same.
