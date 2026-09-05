# ON8 Email Scheduler

A production-grade, full-stack email scheduling platform built as a TypeScript monorepo. Schedule bulk email campaigns, enforce per-sender rate limits, survive server restarts without data loss, and get real-time Slack alerts — all backed by BullMQ, PostgreSQL, Redis, and Elasticsearch.

![Dashboard](https://img.shields.io/badge/Next.js-15-black?logo=next.js) ![Backend](https://img.shields.io/badge/Express-TypeScript-blue?logo=express) ![Queue](https://img.shields.io/badge/BullMQ-Redis-red?logo=redis) ![DB](https://img.shields.io/badge/PostgreSQL-Prisma-blue?logo=postgresql)

---

## Features

- **Google OAuth** — Secure login via Google, JWT-based session shared between frontend and backend
- **Compose Emails** — Rich-text editor, CSV bulk-upload of recipients, image attachments, send now or schedule for later
- **BullMQ Scheduler** — Delayed jobs persisted in Redis (AOF); no cron jobs, ever
- **Multi-sender Support** — Each user can manage multiple sender addresses
- **Per-sender Rate Limiting** — Atomic Redis INCR counters per sender per UTC hour; rate-limited jobs are rescheduled (never dropped)
- **Min-delay Between Sends** — Configurable minimum gap between sends per sender; enforced via Redis without blocking worker threads
- **Restart Safety** — Startup reconciler re-enqueues any jobs lost between a crash and a Redis write
- **Idempotency** — Every job has a stable `idempotencyKey`; double-execution is always a no-op
- **Elasticsearch Search** — Full-text search on subject, body, and recipient email; gracefully degrades if ES is down
- **Slack Notifications** — Real OAuth flow; fires a message to your Slack channel the moment a rate limit is hit
- **Bull Board** — Live BullMQ dashboard at `/admin/queues`
- **Ethereal SMTP** — All emails are captured by Ethereal (no real delivery); preview URL logged per send

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, NextAuth.js |
| Backend | Express.js, TypeScript, Passport.js |
| Queue | BullMQ + Redis (AOF persistence) |
| Database | PostgreSQL (Prisma ORM) |
| Search | Elasticsearch 8 |
| Email | Nodemailer + Ethereal SMTP |
| Notifications | Slack Web API / Incoming Webhooks |
| Infra | Docker Compose |

---

## Architecture

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
│  │ Slack OAuth │  │ schedule     │  │ (live queue dashboard)    │   │
│  │ → JWT sign  │  │ scheduled    │  └──────────────────────────┘   │
│  └─────────────┘  │ sent         │                                  │
│                   │ search (ES)  │                                  │
│                   └──────┬───────┘                                  │
│  ┌────────────────────────▼─────────────────────────────────────┐   │
│  │  BullMQ Worker (concurrency=WORKER_CONCURRENCY)              │   │
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

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Docker Desktop** (for Postgres, Redis, Elasticsearch)
- **Google Cloud project** with OAuth2 credentials
- **Slack app** (optional, for rate-limit notifications)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/email-scheduler.git
cd email-scheduler
```

### 2. Configure environment variables

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env.local
```

Edit `backend/.env`:

```env
# Required
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_SECRET=<run: openssl rand -base64 32>

# Optional — Slack notifications
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
```

Edit `frontend/.env.local`:

```env
NEXTAUTH_SECRET=<same value as backend>
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

> **Important:** `NEXTAUTH_SECRET` must be identical in both files.

### 3. Start infrastructure (Docker)

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on port `5433`
- **Redis** on port `6379` (AOF persistence enabled)
- **Elasticsearch** on port `9200` (single-node, 512MB heap)

Wait for health checks to pass (~30 seconds on first run).

### 4. Set up the backend

```bash
cd backend
npm install

# Run database migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Start the backend server
npm run dev
```

The backend starts on **http://localhost:4000**.

On startup it will:
1. Create the Elasticsearch `emails` index
2. Start the BullMQ worker
3. Run the startup reconciler (re-enqueues any jobs lost before a previous crash)

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on **http://localhost:3000**.

### 6. Access the app

| URL | Description |
|---|---|
| http://localhost:3000 | Login & Dashboard |
| http://localhost:4000/admin/queues | Bull Board (live queue monitor) |
| http://localhost:4000/health | Backend health check |
| https://ethereal.email | View sent test emails |

---

## Google OAuth Setup

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add Authorized redirect URI: `http://localhost:4000/auth/google/callback`
4. Copy **Client ID** and **Client Secret** → paste into `backend/.env`

---

## Slack Integration Setup

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) → **Create New App**
2. Under **OAuth & Permissions** → **Bot Token Scopes**, add:
   - `incoming-webhook`
   - `chat:write`
3. Under **OAuth & Permissions** → **Redirect URLs**, add: `http://localhost:4000/auth/slack/callback`
4. Copy **Client ID** and **Client Secret** from **Basic Information** → paste into `backend/.env`
5. Install the app to your workspace
6. In the dashboard, click **"Connect Slack"** in the sidebar

Once connected, you'll receive a Slack message every time a sender's hourly email limit is reached.

---

## Rate Limiting Design

### Per-sender hourly limit

```
Redis key: ratelimit:{senderId}:{YYYY-MM-DDTHH}   (UTC hour window)
TTL: 7200s (2 hours for clock-skew safety)

On each job:
  count = INCR key
  if count > MAX_EMAILS_PER_HOUR_PER_SENDER:
    DECR key  (rollback)
    Enqueue new delayed job at next UTC hour boundary
    Update DB status → 'rate_limited'
    Notify Slack
```

**Why Redis INCR?** Atomic across multiple workers — no race condition possible regardless of `WORKER_CONCURRENCY`.

**Why rescheduled, not dropped?** Jobs are re-enqueued with the same `idempotencyKey`. They run at the start of the next hour and are safe from duplication.

### Min-delay between sends

```
Redis key: lastsent:{senderId}    (Unix timestamp ms of last send)

On each job:
  msSinceLast = now - GET(lastsent key)
  if msSinceLast < MIN_DELAY_MS_BETWEEN_SENDS:
    DECR hourly counter  (rollback)
    Enqueue new delayed job for (remaining ms)
```

**Why not `sleep()`?** Sleeping wastes a BullMQ concurrency slot. Delayed re-enqueue releases the slot immediately.

---

## Restart Safety & Idempotency

### The problem

If the server restarts, delayed BullMQ jobs could be:
1. **Still in Redis** (AOF persistence — normal case) → no action needed
2. **Lost from Redis** (Redis crashed without AOF) → need re-enqueue
3. **Never reached Redis** (server crashed between DB write and `queue.add()`) → need re-enqueue

### Solution: Startup Reconciler

On every startup (`startupReconciler.ts`):
1. Query DB for all `status IN ['scheduled', 'rate_limited']` rows
2. For each row: call `queue.getJob(bullJobId)`
   - **Found** → already in Redis, BullMQ handles it
   - **Not found** → re-enqueue with `delay = max(0, scheduledAt - now)`
3. Rows with `bullJobId = null` → always re-enqueue (crash scenario 3)

### Idempotency key design

- Generated as `cuid()` **once** at job creation
- Stored with a `@unique` DB constraint
- **Never recomputed** across reschedules, rate-limit delays, or reconciler re-enqueues
- Worker Step 1 always checks `status === 'sent'` before sending — double execution is always a no-op

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✓ | — | PostgreSQL connection string |
| `REDIS_URL` | — | `redis://localhost:6379` | Redis connection string |
| `ELASTICSEARCH_URL` | — | `http://localhost:9200` | Elasticsearch endpoint |
| `GOOGLE_CLIENT_ID` | ✓ | — | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | ✓ | — | Google OAuth2 client secret |
| `NEXTAUTH_SECRET` | ✓ | — | JWT signing secret (≥32 chars) |
| `SLACK_CLIENT_ID` | — | — | Slack app client ID |
| `SLACK_CLIENT_SECRET` | — | — | Slack app client secret |
| `ETHEREAL_USER` | — | auto | Ethereal SMTP user |
| `ETHEREAL_PASS` | — | auto | Ethereal SMTP password |
| `BACKEND_PORT` | — | `4000` | Express server port |
| `FRONTEND_URL` | — | `http://localhost:3000` | Allowed CORS origin |
| `WORKER_CONCURRENCY` | — | `5` | BullMQ worker concurrency |
| `MIN_DELAY_MS_BETWEEN_SENDS` | — | `2000` | Min ms between sends per sender |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | — | `200` | Hourly send cap per sender |
| `NODE_ENV` | — | `development` | Node environment |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXTAUTH_SECRET` | ✓ | Must match backend `NEXTAUTH_SECRET` |
| `NEXTAUTH_URL` | ✓ | Frontend base URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_BACKEND_URL` | ✓ | Backend base URL (e.g. `http://localhost:4000`) |

---

## Project Structure

```
email-scheduler/
├── docker-compose.yml          # Postgres, Redis, Elasticsearch
├── .env.example                # Root-level env template
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # DB schema (User, Sender, EmailJob)
│   │   └── migrations/         # Prisma migration history
│   ├── src/
│   │   ├── config.ts           # Typed env config loader
│   │   ├── index.ts            # Express app + Bull Board setup
│   │   ├── db/prisma.ts        # Prisma client singleton
│   │   ├── middleware/auth.ts  # JWT requireAuth middleware
│   │   ├── routes/
│   │   │   ├── auth.ts         # Google + Slack OAuth routes
│   │   │   └── emails.ts       # Schedule, list, search endpoints
│   │   ├── queue/
│   │   │   ├── emailQueue.ts       # BullMQ queue + enqueue helpers
│   │   │   ├── emailWorker.ts      # 5-step job processor
│   │   │   └── startupReconciler.ts # Restart-safety reconciler
│   │   ├── mailer/ethereal.ts  # Nodemailer SMTP transport
│   │   ├── slack/notifier.ts   # Rate-limit Slack notifications
│   │   ├── elasticsearch/
│   │   │   ├── client.ts       # ES client + health check
│   │   │   └── emailIndex.ts   # Index management + search
│   │   └── redis/client.ts     # Redis + BullMQ connection factory
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx            # Login page
    │   │   ├── dashboard/page.tsx  # Main dashboard
    │   │   └── auth/callback/      # NextAuth token handler
    │   ├── components/
    │   │   ├── Sidebar.tsx         # Nav + Slack connect button
    │   │   ├── TopBar.tsx          # Search + refresh
    │   │   ├── EmailList.tsx       # Scheduled/Sent list with skeleton
    │   │   ├── EmailDetail.tsx     # Email detail view
    │   │   ├── ComposeView.tsx     # Full compose UI
    │   │   └── SendLaterPopover.tsx # Date picker + presets
    │   ├── lib/api.ts              # Typed API client (all endpoints)
    │   └── types/index.ts          # Shared TypeScript interfaces
    ├── .env.example
    └── package.json
```

---

## API Reference

### Authentication
| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/google` | Initiate Google OAuth |
| `GET` | `/auth/google/callback` | Google OAuth callback → JWT redirect |
| `GET` | `/auth/slack` | Initiate Slack OAuth (`?userId=`) |
| `GET` | `/auth/slack/callback` | Slack OAuth callback → store token |
| `GET` | `/auth/slack/status` | Check if current user has Slack connected |
| `DELETE` | `/auth/slack/disconnect` | Remove Slack credentials |
| `GET` | `/auth/me` | Return current user from JWT |

### Emails
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/emails/schedule` | Schedule emails for a list of recipients |
| `GET` | `/api/emails/scheduled` | Paginated list of scheduled/rate-limited jobs |
| `GET` | `/api/emails/sent` | Paginated list of sent/failed jobs |
| `GET` | `/api/emails/search?q=` | Elasticsearch full-text search |
| `GET` | `/api/emails/:id` | Single email job detail |
| `GET` | `/api/emails/senders/list` | List senders for authenticated user |

---

## Trade-offs & Design Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Auth | NextAuth JWT + Express `jsonwebtoken.verify` | No cross-origin cookie complexity; token shared between Next.js and Express |
| Scheduling | BullMQ delayed jobs | Native Redis-backed, no OS cron, supports precise delays |
| Rate limiting | Redis INCR per sender per hour | Atomic, multi-worker safe, resets precisely at UTC hour boundary |
| Min-delay | Delayed-reschedule (not sleep) | Never wastes a BullMQ worker concurrency slot |
| Restart safety | DB-backed reconciler | Works even when Redis loses data (no AOF or Redis crash) |
| Idempotency | CUID at creation, never recomputed | Stable key through all reschedules and crash-recovery paths |
| ES degradation | `{ degraded: true }` response | ES being down never blocks scheduling or sending |
| Attachment storage | Base64 in Postgres JSON column | Suitable for demo/testing; production would use S3 or similar |

---

## License

MIT
