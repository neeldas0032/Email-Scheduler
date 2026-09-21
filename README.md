# Email Job Scheduler

A production-shaped email scheduling service: an Express + TypeScript API, a BullMQ worker backed by Redis, Postgres for durable state, Elasticsearch for search, Ethereal for fake SMTP delivery, and a Next.js dashboard.

No cron anywhere. Scheduling is BullMQ delayed jobs; persistence and idempotency are enforced in Postgres and Redis.

---

## 1. Run it

### Prerequisites
- Node.js 20+
- Docker (for Postgres, Redis, Elasticsearch)

### Start the infrastructure
```bash
docker compose up -d          # postgres:5432, redis:6379, elasticsearch:9200
```

### Backend
```bash
cd backend
cp .env.example .env          # then fill in the OAuth values below
npm install
npm run dev                   # API + worker on http://localhost:4000
```

The schema is created automatically on boot (`CREATE TABLE IF NOT EXISTS`), so there is no migration step. `npm run db:init` runs it on its own if you want to.

### Frontend
```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

### Running the worker separately (optional, for scaling)
```bash
# terminal 1 - API only
START_WORKER_INLINE=false npm run dev
# terminal 2..n - workers
npm run dev:worker
```
Rate limits and idempotency live in Redis and Postgres, so any number of workers is safe.

### Useful URLs
| What | URL |
| --- | --- |
| Dashboard | http://localhost:3000 |
| API health | http://localhost:4000/health |
| Live BullMQ dashboard | http://localhost:4000/admin/queues |

---

## 2. Environment variables

Everything tunable is in `backend/.env` — no limits, delays or concurrency values are hardcoded.

| Variable | Default | Meaning |
| --- | --- | --- |
| `WORKER_CONCURRENCY` | `5` | Jobs processed in parallel per worker |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | `2000` | Minimum gap between two sends (queue-wide) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `100` | Per-sender hourly ceiling |
| `MAX_EMAILS_PER_HOUR` | `500` | Account-wide hourly ceiling |
| `JOB_ATTEMPTS` / `JOB_BACKOFF_MS` | `3` / `5000` | Retry policy for SMTP failures |
| `START_WORKER_INLINE` | `true` | Run the worker inside the API process |
| `ELASTICSEARCH_ENABLED` | `true` | Turn search indexing off if ES is unavailable |
| `AUTO_PROVISION_ETHEREAL_SENDERS` | `true` | Create Ethereal inboxes on first login |
| `ETHEREAL_SENDER_COUNT` | `2` | How many senders to provision per user |

### Ethereal (fake SMTP)
Nothing to set up by hand. On first login the backend calls `nodemailer.createTestAccount()` and stores **two** Ethereal inboxes as senders for that user, so multi-sender round robin works out of the box. Every delivered email stores its Ethereal preview URL, and the **Sent** tab links to it.

To use a fixed account instead, set `AUTO_PROVISION_ETHEREAL_SENDERS=false` and fill `ETHEREAL_USER` / `ETHEREAL_PASS`. `npm run seed:senders` prints a fresh Ethereal account or reseeds existing users.

### Google OAuth
1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID → Web application.
2. Authorised redirect URI: `http://localhost:4000/auth/google/callback`.
3. Put the client id/secret in `backend/.env`.

### Slack OAuth
1. api.slack.com/apps → Create New App → From scratch.
2. OAuth & Permissions → Redirect URL: `http://localhost:4000/api/slack/callback`.
3. Bot token scopes: `incoming-webhook`, `chat:write`.
4. Put the client id/secret in `backend/.env`.

"Connect Slack" in the dashboard header runs the real authorize flow; the incoming webhook is stored per user in Postgres.

---

## 3. Architecture

```
Next.js dashboard ──► Express API ──► Postgres  (source of truth: emails, campaigns, senders, slack)
                          │
                          ├──► BullMQ queue (Redis) ── delayed jobs, one per email
                          │            │
                          │            ▼
                          │      BullMQ Worker ──► Redis rate-limit counters (Lua, atomic)
                          │            │        └─► Ethereal SMTP (nodemailer)
                          │            │        └─► Slack incoming webhook
                          │            ▼
                          └──► Elasticsearch  ◄── index on schedule and on send
```

### How scheduling works
1. `POST /api/campaigns` writes the campaign and one `emails` row per recipient in a single transaction. Recipient *i* gets `scheduled_at = startAt + i * delayMs` and is assigned a sender round-robin.
2. After the commit, one BullMQ **delayed job** per email is added via `addBulk`, with `jobId = email:<uuid>` and `delay = scheduled_at - now`.
3. Redis holds the delayed set; BullMQ promotes each job at its due time and a worker picks it up.

Spacing is baked into the schedule itself rather than being a `sleep` inside the worker, so a worker restart never collapses the spacing.

### How persistence across restarts works
Three independent layers:

1. **Delayed jobs live in Redis**, not in process memory. Killing the API or the worker leaves the schedule intact — restart and the same jobs fire at the same timestamps.
2. **Redis runs with `appendonly yes`** in `docker-compose.yml`, so a Redis restart also keeps the delayed set.
3. **Boot-time reconciler** (`reconcilePendingJobs`) covers the worst case — Redis wiped entirely. On every boot the service reads every email still `scheduled` / `rate_limited` in Postgres and re-adds its job. Because the job id is derived from the email id, re-adding an existing job is a no-op, so this can never duplicate anything. Emails whose slot passed while the server was down go out immediately, spaced by `MIN_DELAY_BETWEEN_EMAILS_MS` so they do not burst.

### Idempotency — an email is never sent twice
Two guards, either of which is sufficient:

- **Deterministic job id**: `jobId = email:<uuid>`. BullMQ refuses a second job with the same id, so re-queueing is idempotent.
- **Conditional claim in Postgres**: the worker's first statement is
  ```sql
  UPDATE emails SET status='processing', attempts=attempts+1
  WHERE id=$1 AND status IN ('scheduled','rate_limited') RETURNING *;
  ```
  Only one worker can win that row. Zero rows returned means another worker already has it (or it was sent or cancelled), and the job exits as `skipped`. This holds under concurrency, retries, duplicate delivery and multi-instance deployments.

### Concurrency and the minimum delay
- `WORKER_CONCURRENCY` (default 5) sets how many jobs a worker processes in parallel. Parallel execution is safe because every mutation is a conditional `UPDATE` and every counter is an atomic Redis operation.
- The worker is created with `limiter: { max: 1, duration: MIN_DELAY_BETWEEN_EMAILS_MS }`. BullMQ stores that limiter in Redis, so **the throttle is shared across every worker instance**, not per process. Default: **one send every 2 seconds, queue-wide**.
- Nodemailer transports are pooled and cached per sender, so concurrency does not open a new SMTP connection per email.

### Rate limiting (per sender + global)
Hourly counters in Redis, keyed `rl:sender:<senderId>:<YYYYMMDDHH>` and `rl:global:<YYYYMMDDHH>`, with a TTL that expires at the end of the window.

Both checks and the rollback on rejection happen inside **one Lua script**, so they are atomic — without that, two workers can both read "one slot left" and both take it:

```lua
INCR global; if over limit -> DECR, reject
INCR sender; if over limit -> DECR sender, DECR global, reject
else allow
```

When a sender is out of budget:
1. The worker tries the user's **other active senders** first — that is the point of supporting multiple senders.
2. If every sender is exhausted, the job is **not dropped and not failed**. The row goes back to `rate_limited`, `scheduled_at` moves to the next hour window, and `job.moveToDelayed(nextWindow, token)` re-parks the job in Redis.
3. Order is preserved: the new timestamp is `nextHourStart + (position % hourlyLimit) * spacing`, so email #1 is still attempted before email #500.
4. If the send throws after a slot was taken, `releaseSlot()` returns the slot — a failed SMTP call does not consume hourly budget.

**Trade-offs.** Fixed hour windows (not a sliding window) — simpler, cheaper, and it matches how providers publish limits, at the cost of allowing a burst at a window boundary. The counter is incremented *before* the send, so a crash between increment and send leaks one slot for that hour; I chose that over the alternative, which risks exceeding the provider's limit.

### Slack notification on rate-limit hit
Real OAuth v2 flow from the dashboard header → the incoming webhook is stored per user → the moment a sender's hourly ceiling is hit, the worker posts a Block Kit message naming the sender, the limit, and when sending resumes.

- Deduped with `SET key NX EX 3700` per user+sender+hour, so a 1000-email burst produces **one** message, not one per job.
- Not connected is a normal state: `postMessage` returns `false` and sending continues. Connect later and notifications start working with no redeploy — the webhook is read from the DB on every call.

### Behaviour under load (1000+ emails at once)
- 1000 rows are inserted in a single multi-row `INSERT`, and jobs are added with `addBulk` in chunks of 500 — a few round trips, not 1000.
- All 1000 sit in Redis' delayed set. BullMQ promotes them as they come due; the shared limiter releases one every 2s and at most `WORKER_CONCURRENCY` run at a time, so SMTP is never stampeded.
- With a 100/hour sender limit, the first 100 go out, the remaining 900 are re-parked into later hour windows in order, one Slack alert fires, and the dashboard shows them as *Waiting on limit*.
- Try it: `npm run demo:load -- 1000`.

### Search (Elasticsearch)
Emails are indexed on schedule (bulk) and again on send/fail, with a mapping over `toEmail`, `subject`, `body`, `status`, `scheduledAt`. The dashboard search box queries `multi_match` with fuzziness, filtered by user and by the current tab's statuses.

Search is treated as an enhancement, never a dependency: if Elasticsearch is down or disabled, indexing is skipped, queries fall back to a Postgres `ILIKE`, and **sending is unaffected**.

---

## 4. Features implemented

### Backend
- [x] Express + TypeScript, modular structure (`routes` → `services` → `db`/`queue`)
- [x] Postgres for durable state (users, senders, campaigns, emails, slack integrations)
- [x] BullMQ delayed jobs — **no cron of any kind**
- [x] Ethereal SMTP, multiple senders per user, round-robin assignment, pooled transports
- [x] Survives restarts: Redis AOF + boot-time reconciler from Postgres
- [x] Idempotency: deterministic job ids + conditional DB claim
- [x] Configurable worker concurrency
- [x] Minimum delay between sends, shared across workers via the BullMQ limiter
- [x] Hourly rate limiting, per sender **and** global, Redis-backed and atomic
- [x] Rate-limited jobs rescheduled into the next window, order preserved, nothing dropped
- [x] Real Slack OAuth + live Block Kit notification on limit hit, deduped per hour
- [x] Elasticsearch indexing + search with Postgres fallback
- [x] Live BullMQ dashboard at `/admin/queues`
- [x] Retries with exponential backoff, failures recorded with the error message
- [x] Google OAuth, JWT in an httpOnly cookie
- [x] Request validation with zod, central error handler
- [x] Load-test script (`npm run demo:load -- 1000`)

### Frontend
- [x] Real Google login, redirect to dashboard, avatar + name + email in the header, logout
- [x] Scheduled / Sent tabs with live counts
- [x] Compose modal: subject, body, CSV/TXT upload with detected-address count, start time, delay, hourly limit
- [x] Scheduled table: recipient, subject, scheduled time, status, cancel
- [x] Sent table: recipient, subject, sent time, status, Ethereal preview link
- [x] Search box wired to the Elasticsearch-backed endpoint
- [x] Loading, empty, and error states on every view; toasts for success and failure
- [x] Sending-capacity panel: live per-sender hourly usage, concurrency and throttle settings
- [x] Slack connect / test from the header
- [x] Auto-refresh every 5s, so scheduled → sent transitions appear without a reload
- [x] Typed API client, reusable UI primitives, responsive down to mobile

---

## 5. API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/auth/google` | Start Google OAuth |
| `GET` | `/auth/google/callback` | Exchange code, set session cookie |
| `GET` | `/auth/me` | Current user |
| `POST` | `/auth/logout` | Clear session |
| `POST` | `/api/campaigns` | Schedule a campaign |
| `GET` | `/api/emails?tab=scheduled\|sent&q=` | List / search emails |
| `GET` | `/api/stats` | Counts, senders, live hourly usage, limits |
| `POST` | `/api/emails/:id/cancel` | Cancel a pending email |
| `GET` | `/api/slack/install` | Start Slack OAuth |
| `GET` | `/api/slack/status` | Connection state |
| `POST` | `/api/slack/test` | Post a test message |
| `POST` | `/api/slack/disconnect` | Remove the integration |
| `GET` | `/admin/queues` | Live BullMQ dashboard |

Schedule payload:
```json
{
  "subject": "Quick question",
  "body": "Hi there...",
  "recipients": ["a@example.com", "b@example.com"],
  "startAt": "2026-01-01T10:00:00.000Z",
  "delayMs": 2000,
  "hourlyLimit": 100
}
```

---

## 6. Assumptions and trade-offs

1. **No Figma file was attached to the assignment**, so the dashboard follows the described structure (header with user info, Scheduled/Sent tabs, Compose button, tables with loading/empty states) in a dark operator-console style. Swapping the palette in `tailwind.config.ts` is the only change needed to match a specific design.
2. **Raw SQL over an ORM.** The schema is small and the hot paths depend on exact `UPDATE ... WHERE status IN (...) RETURNING *` semantics for idempotency. An ORM would add a build step and hide the concurrency behaviour that matters most here.
3. **One job per email, not per campaign.** More Redis keys, but each email gets independent retries, cancellation and rate-limit rescheduling.
4. **Fixed hour windows** for rate limiting rather than a sliding window — see the trade-off note above.
5. **Ethereal accounts are provisioned per user at first login** so the project runs with zero SMTP setup. Ethereal inboxes are ephemeral; `npm run seed:senders` issues fresh ones.
6. **The hourly limit from the compose form is applied to the user's senders** rather than stored per campaign, matching the per-sender limiting the brief asks for.
7. **Polling every 5s** in the dashboard instead of websockets — fewer moving parts for the same perceived liveness.
8. **Dashboard auth is a JWT in an httpOnly cookie.** In production I would add refresh tokens and CSRF tokens on mutating routes.
9. `/admin/queues` is unauthenticated for demo convenience; it would sit behind auth in production.

## 7. With more time
Per-campaign analytics (open/click), a sliding-window limiter, sender warm-up ramps, dead-letter handling with a retry-from-UI button, unit tests around the limiter Lua script and the idempotency claim, and websockets in place of polling.
