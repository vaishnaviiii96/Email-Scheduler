# ON8 Email Scheduler

A production-grade, full-stack email scheduling platform. Schedule bulk email campaigns, enforce per-sender rate limits, survive server restarts without data loss, and get real-time Slack alerts — all backed by BullMQ, PostgreSQL, Redis, and Elasticsearch.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js) ![Express](https://img.shields.io/badge/Express-TypeScript-blue?logo=express) ![BullMQ](https://img.shields.io/badge/BullMQ-Redis-red?logo=redis) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-blue?logo=postgresql)

---

## Demo Video

![ON8 Email Scheduler Demo](demo.webp)

*Demo covers: Login, Dashboard, Compose Flow (Rich Text, Multi-recipient, Schedule Later), Rate Limiting alerts (via Slack), Queue processing (Bull Board), and Search.*

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Running the Backend](#running-the-backend)
- [Running the Frontend](#running-the-frontend)
- [Environment Variables](#environment-variables)
- [Ethereal Email Setup](#ethereal-email-setup)
- [Google OAuth Setup](#google-oauth-setup)
- [Slack Integration Setup](#slack-integration-setup)
- [Assumptions, Shortcuts & Trade-offs](#assumptions-shortcuts--trade-offs)

---

## Features

### Backend
| Feature | Implementation |
|---|---|
| **Email Scheduling API** | `POST /api/emails/schedule` accepts recipients, subject, body, start time, delay, hourly limit |
| **BullMQ Delayed Jobs** | Each email is a BullMQ job delayed to `startTime + i * delay`. Zero cron. |
| **PostgreSQL Persistence** | Every `EmailJob` stored in Postgres via Prisma ORM before enqueue |
| **Restart Safety** | `startupReconciler.ts` re-enqueues any jobs lost between a crash and a Redis write |
| **Idempotency** | Stable `cuid()` per job; DB unique constraint; worker skips already-sent jobs |
| **Worker Concurrency** | Configurable via `WORKER_CONCURRENCY` env var (default: 5) |
| **Per-sender Rate Limiting** | Atomic Redis `INCR` per `{senderId}:{UTChour}`; over-limit jobs rescheduled to next hour |
| **Min-delay Between Sends** | Redis `lastsent:{senderId}` key; delayed-reschedule (never blocks a worker thread) |
| **Multi-sender Support** | Each user can have multiple sender email addresses |
| **Elasticsearch Search** | Emails indexed on create/update; full-text search on subject, body, recipient |
| **Bull Board Dashboard** | Live queue view at `/admin/queues` |
| **Slack Notifications** | OAuth flow stores webhook per user; fires on every rate-limit hit |
| **Ethereal SMTP** | All emails captured by Ethereal (no real delivery); preview URL in logs |

### Frontend
| Feature | Implementation |
|---|---|
| **Google OAuth Login** | Real OAuth via NextAuth + Passport.js; JWT shared between frontend and backend |
| **User Header** | Avatar, name, email shown in sidebar; click to logout |
| **Dashboard** | Scheduled tab + Sent tab; auto-refreshes every 30 seconds |
| **Email List** | Table with recipient, subject, time, status badges; skeleton loading; empty states |
| **Email Detail** | Click any email to see full detail view |
| **Compose** | Rich-text editor (Quill), subject, From selector, delay, hourly limit inputs |
| **CSV Bulk Upload** | Upload CSV of email addresses; parsed client-side; count shown |
| **Image Attachments** | Paperclip icon attaches images; converted to Base64; rendered inline in Ethereal |
| **Send Later** | Clock icon opens popover with presets (15min, 1hr, tomorrow 9am) and date picker |
| **Elasticsearch Search** | TopBar search box queries ES; results replace list |
| **Connect Slack** | Sidebar button triggers full Slack OAuth; shows connected/disconnect state |
| **Bull Board Link** | Sidebar shortcut to `/admin/queues` |
| **Error handling** | Banner alerts, loading spinners, empty states throughout |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, NextAuth.js |
| Backend | Express.js, TypeScript, Passport.js |
| Queue | BullMQ + Redis (AOF persistence) |
| Database | PostgreSQL + Prisma ORM |
| Search | Elasticsearch 8 |
| Email | Nodemailer + Ethereal SMTP |
| Notifications | Slack Web API + Incoming Webhooks |
| Infra | Docker Compose |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js :3000)                                            │
│  Login → Dashboard → Compose → Send Later                           │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ Bearer JWT
┌───────────────────────────▼─────────────────────────────────────────┐
│  Express Backend (:4000)                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Google OAuth│  │ /api/emails  │  │ Bull Board /admin/queues  │   │
│  │ Slack OAuth │  │ /auth/slack  │  └──────────────────────────┘   │
│  └─────────────┘  └──────┬───────┘                                  │
│  ┌────────────────────────▼─────────────────────────────────────┐   │
│  │  BullMQ Worker (concurrency = WORKER_CONCURRENCY)            │   │
│  │                                                              │   │
│  │  Step 1: Idempotency check  (status == 'sent'? skip)        │   │
│  │  Step 2: Per-sender hourly rate limit (Redis INCR, atomic)  │   │
│  │          → over limit: reschedule to next UTC hour + Slack  │   │
│  │  Step 3: Per-sender min-delay check (Redis lastSentAt key)  │   │
│  │          → too soon: reschedule with remaining delay        │   │
│  │  Step 4: Claim send slot (SET lastSentAt before send)       │   │
│  │  Step 5: Send via Ethereal SMTP → update DB + ES            │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
          │                  │                        │
          ▼                  ▼                        ▼
┌──────────────┐  ┌──────────────────┐  ┌───────────────────────────┐
│ Postgres:5433│  │ Redis:6379       │  │ Elasticsearch:9200        │
│ Users        │  │ AOF persistence  │  │ 'emails' index            │
│ Senders      │  │ BullMQ delayed   │  │ multi-match search        │
│ EmailJobs    │  │ jobs             │  │ graceful degradation      │
└──────────────┘  └──────────────────┘  └───────────────────────────┘
```

### How Scheduling Works

1. `POST /api/emails/schedule` receives: recipients array, subject, body, startTime, delayBetweenEmailsMs, maxEmailsPerHour
2. For each recipient `i`, the backend computes `scheduledAt = startTime + i * delay`
3. An `EmailJob` row is created in Postgres **first** (idempotency anchor)
4. A BullMQ delayed job is created with `delay = scheduledAt - now`
5. The `bullJobId` is written back to the DB row

When the delay expires, BullMQ wakes the worker, which runs the 5-step processor above.

### How Persistence on Restart Is Handled

On every backend startup, `startupReconciler.ts` runs:

```
1. Query DB for all rows WHERE status IN ('scheduled', 'rate_limited')
2. For each row:
   a. If bullJobId exists → call queue.getJob(bullJobId)
      - Job found in Redis → skip (BullMQ handles it normally)
      - Job NOT found in Redis → re-enqueue with delay = max(0, scheduledAt - now)
   b. If bullJobId is null → re-enqueue unconditionally
3. Update DB bullJobId for all re-enqueued jobs
```

**Why this is safe:**
- Re-enqueued jobs carry the **same** `idempotencyKey` as the original DB row
- Worker Step 1 always checks `status === 'sent'` before sending — double execution is always a no-op
- BullMQ deduplicates by `jobId = email-{idempotencyKey}` if the job is still in the queue

**Redis AOF:** Docker Compose runs Redis with `--appendonly yes`, so BullMQ jobs survive Redis restarts too.

### How Rate Limiting & Concurrency Are Implemented

**Worker Concurrency:**
```env
WORKER_CONCURRENCY=5   # 5 jobs processed simultaneously
```
Each worker instance processes jobs in parallel. All shared state (rate limit counters, last-sent timestamps) lives in Redis — safe across any number of workers or instances.

**Per-sender Hourly Rate Limit:**
```
Redis key: ratelimit:{senderId}:{YYYY-MM-DDTHH}  (UTC hour window)
TTL:       7200s (2 hours, for clock-skew safety)

On each job:
  count = INCR key              ← atomic, no race condition
  if count > MAX_EMAILS_PER_HOUR_PER_SENDER:
    DECR key                    ← rollback — this slot isn't used
    enqueue new delayed job     ← runs at start of next UTC hour
    DB status → 'rate_limited'
    notify Slack                ← non-throwing, fire-and-forget
    return                      ← current job acked
```

**Min-delay Between Sends:**
```
Redis key: lastsent:{senderId}  (Unix timestamp ms of last send)

On each job:
  msSinceLast = now - GET(lastsent key)
  if msSinceLast < MIN_DELAY_MS_BETWEEN_SENDS:
    DECR hourly counter         ← rollback
    enqueue new delayed job     ← runs after remaining delay ms
    return
```

> **Why delayed-reschedule instead of sleep?**
> Sleeping inside the worker wastes a concurrency slot for the full wait duration. With 5 concurrent workers all processing the same sender, each would sleep/poll the same Redis key. Delayed-reschedule releases the slot immediately and lets BullMQ schedule the retry precisely.

---

## Running the Backend

### Prerequisites
- Node.js 18+
- Docker Desktop (for Postgres, Redis, Elasticsearch)

### Step 1 — Start infrastructure

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on port `5433`
- **Redis** on port `6379` (AOF enabled — jobs survive restarts)
- **Elasticsearch** on port `9200`

Wait ~30 seconds for health checks to pass on first run.

### Step 2 — Configure environment

```bash
cp backend/.env.example backend/.env
```

Fill in the required values (see [Environment Variables](#environment-variables)):

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...   # openssl rand -base64 32
```

### Step 3 — Install dependencies & migrate

```bash
cd backend
npm install
npx prisma migrate deploy   # runs all migrations
npx prisma generate          # generates Prisma client
```

### Step 4 — Start the backend

```bash
npm run dev
```

The server starts on **http://localhost:4000**.

On startup it will log:
```
[app] Starting Email Scheduler backend...
[es]  Created index 'emails'           ← or "already exists"
[worker] Started with concurrency=5
[reconciler] Starting startup reconciliation...
[reconciler] Complete — re-queued: 0, already-in-redis: 0, total: 0
[app] Server running on http://localhost:4000
[app] Bull Board: http://localhost:4000/admin/queues
```

### Available endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/auth/google` | Initiate Google OAuth |
| `GET` | `/auth/slack` | Initiate Slack OAuth |
| `GET` | `/auth/slack/status` | Check Slack connection |
| `DELETE` | `/auth/slack/disconnect` | Disconnect Slack |
| `POST` | `/api/emails/schedule` | Schedule email campaign |
| `GET` | `/api/emails/scheduled` | Paginated scheduled list |
| `GET` | `/api/emails/sent` | Paginated sent list |
| `GET` | `/api/emails/search?q=` | Elasticsearch full-text search |
| `GET` | `/api/emails/senders/list` | List sender addresses |
| `GET` | `/admin/queues` | Bull Board (live queue UI) |

---

## Running the Frontend

### Step 1 — Configure environment

```bash
cp frontend/.env.example frontend/.env.local
```

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<same value as backend NEXTAUTH_SECRET>
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

### Step 2 — Install & run

```bash
cd frontend
npm install
npm run dev
```

The app starts on **http://localhost:3000**.

---

## Environment Variables

### Backend — `backend/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✓ | — | PostgreSQL connection string |
| `REDIS_URL` | — | `redis://localhost:6379` | Redis connection |
| `ELASTICSEARCH_URL` | — | `http://localhost:9200` | ES endpoint |
| `GOOGLE_CLIENT_ID` | ✓ | — | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | ✓ | — | Google OAuth2 client secret |
| `NEXTAUTH_SECRET` | ✓ | — | JWT signing secret (≥32 chars) |
| `SLACK_CLIENT_ID` | — | — | Slack app client ID |
| `SLACK_CLIENT_SECRET` | — | — | Slack app client secret |
| `ETHEREAL_USER` | — | auto | Ethereal SMTP user |
| `ETHEREAL_PASS` | — | auto | Ethereal SMTP password |
| `BACKEND_PORT` | — | `4000` | Express server port |
| `FRONTEND_URL` | — | `http://localhost:3000` | CORS origin |
| `WORKER_CONCURRENCY` | — | `5` | BullMQ worker concurrency |
| `MIN_DELAY_MS_BETWEEN_SENDS` | — | `2000` | Min ms between sends per sender |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | — | `200` | Hourly send cap per sender |

### Frontend — `frontend/.env.local`

| Variable | Required | Description |
|---|---|---|
| `NEXTAUTH_SECRET` | ✓ | Must match backend `NEXTAUTH_SECRET` exactly |
| `NEXTAUTH_URL` | ✓ | Frontend base URL |
| `NEXT_PUBLIC_BACKEND_URL` | ✓ | Backend base URL |

---

## Ethereal Email Setup

Ethereal is a fake SMTP service — emails are captured and viewable in a web inbox. No real emails are delivered.

### Auto-provisioning (default)
Leave `ETHEREAL_USER` and `ETHEREAL_PASS` **empty** in `backend/.env`. On first startup, the backend auto-creates a throwaway Ethereal account and logs the credentials:

```
[mailer] Auto-created Ethereal test account:
[mailer]   User: abc123@ethereal.email
[mailer]   Pass: xxxxxxxxxxxxxxxx
[mailer]   Preview emails at: https://ethereal.email
```

### Persistent inbox
To keep the same inbox across restarts:
1. Go to [https://ethereal.email](https://ethereal.email) → **Create Account**
2. Copy the generated credentials
3. Paste into `backend/.env`:
   ```env
   ETHEREAL_USER=your_user@ethereal.email
   ETHEREAL_PASS=your_password
   ```

### Viewing sent emails
After each successful send, a preview URL is logged:
```
[worker] ✓ Sent <abc@ethereal> to recipient@example.com
[worker]   Preview: https://ethereal.email/message/xxx
```
Or log in at [https://ethereal.email](https://ethereal.email) with the credentials above to see all captured messages.

---

## Google OAuth Setup

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Add Authorized redirect URI: `http://localhost:4000/auth/google/callback`
5. Copy **Client ID** and **Client Secret** → paste into `backend/.env`

---

## Slack Integration Setup

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From scratch**
2. **OAuth & Permissions → Bot Token Scopes** — add:
   - `incoming-webhook`
   - `chat:write`
3. **OAuth & Permissions → Redirect URLs** — add: `http://localhost:4000/auth/slack/callback`
4. **Install App** → install to your workspace
5. **Basic Information → App Credentials** — copy **Client ID** and **Client Secret** → paste into `backend/.env`
6. In the dashboard sidebar, click **Connect Slack** → authorize → pick a channel

Once connected, a Slack message fires automatically every time a sender's hourly rate limit is hit.

---

## Project Structure

```
email-scheduler/
├── docker-compose.yml              # Postgres, Redis, Elasticsearch
├── .env.example                    # Root env template
├── README.md
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma           # User, Sender, EmailJob models
│   │   └── migrations/             # Prisma migration history
│   └── src/
│       ├── config.ts               # Typed env config loader
│       ├── index.ts                # Express app, Bull Board
│       ├── db/prisma.ts            # Prisma client singleton
│       ├── middleware/auth.ts      # JWT requireAuth middleware
│       ├── routes/
│       │   ├── auth.ts             # Google + Slack OAuth
│       │   └── emails.ts           # Schedule, list, search
│       ├── queue/
│       │   ├── emailQueue.ts       # BullMQ queue + enqueue helpers
│       │   ├── emailWorker.ts      # 5-step job processor
│       │   └── startupReconciler.ts
│       ├── mailer/ethereal.ts      # Nodemailer SMTP + inline images
│       ├── slack/notifier.ts       # Rate-limit Slack notifications
│       ├── elasticsearch/
│       │   ├── client.ts
│       │   └── emailIndex.ts       # Index + search logic
│       └── redis/client.ts         # Redis + BullMQ connection factory
│
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx            # Login page
        │   ├── dashboard/page.tsx  # Main dashboard
        │   └── auth/callback/      # NextAuth token handler
        ├── components/
        │   ├── Sidebar.tsx         # Nav + Slack connect
        │   ├── TopBar.tsx          # Search + refresh
        │   ├── EmailList.tsx       # Email table with skeleton
        │   ├── EmailDetail.tsx     # Detail panel
        │   ├── ComposeView.tsx     # Compose UI + attachments
        │   └── SendLaterPopover.tsx
        ├── lib/api.ts              # Typed API client
        └── types/index.ts          # Shared TypeScript interfaces
```

---

## Assumptions, Shortcuts & Trade-offs

| Decision | Choice | Reason / Trade-off |
|---|---|---|
| **Auth** | NextAuth JWT + Express `jsonwebtoken.verify` | No cross-origin cookie complexity. Token cannot be revoked before 7-day expiry (acceptable for demo). |
| **Attachment storage** | Base64 JSON column in Postgres | Simple for demo/prototype. Production would use S3 or similar object storage. |
| **Scheduling persistence** | DB write first, then BullMQ enqueue | Guarantees no job is lost even if the server crashes between the two. The reconciler handles the re-enqueue. |
| **Rate limit window** | Fixed UTC hour boundary (not rolling 60-min window) | Simpler and consistent across workers. Rolling window would require a sorted set; fixed window uses a single `INCR` + TTL. |
| **Elasticsearch** | Graceful degradation | ES being down never blocks scheduling or sending. Search returns `{ degraded: true }` with empty results. |
| **Min-delay enforcement** | Delayed-reschedule (not sleep) | Sleep wastes a BullMQ concurrency slot. Delayed-reschedule releases the slot immediately and is safe under high concurrency. |
| **Bull Board auth** | Public (no auth) | For demo/review purposes. In production, protect with an API key or IP allowlist. |
| **Ethereal SMTP** | Fake SMTP, no real delivery | As specified. Preview URLs are logged per send and viewable at ethereal.email. |
| **Multiple senders** | One default sender created per user on signup | Users can add more senders via the From dropdown in Compose. |
| **1000+ emails scenario** | Handled by BullMQ + rate limiter design | Jobs are created for all recipients upfront. Workers process them concurrently (up to `WORKER_CONCURRENCY`). Rate-limited jobs are automatically rescheduled to the next hour without data loss. |
