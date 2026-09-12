# ReachInbox Full-Stack Email Job Scheduler

Production-grade email scheduler service and dashboard built for the **ReachInbox.ai (Outbox Labs)** Software Development Intern Assignment.

---

## 📌 Architecture Overview

```
                          ┌──────────────────────────┐
                          │   React / Vite UI        │
                          │ (Google OAuth Dashboard) │
                          └────────────┬─────────────┘
                                       │ HTTP REST API
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Express Backend API                               │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 1. Write email to Relational DB      │ 2. Enqueue delayed job to BullMQ     │
│    (Status: SCHEDULED)               │    (jobId = emailId)                 │
└──────────────────┬───────────────────┴──────────────────┬───────────────────┘
                   │                                      │
                   ▼                                      ▼
    ┌─────────────────────────────┐        ┌─────────────────────────────┐
    │  PostgreSQL / MySQL / DB    │        │       Redis Data Store      │
    │ (Durable Source of Truth)   │        │   (BullMQ Delayed Queue &   │
    └─────────────────────────────┘        │  Atomic Hourly Rate Limit)  │
                   ▲                       └──────────────┬──────────────┘
                   │ DB Status Updates                    │
                   │ (SENT / FAILED)                      ▼
┌──────────────────┴──────────────────────────────────────────────────────────┐
│                             BullMQ Worker Cluster                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Idempotency Guard: Checks DB before sending (skips if status === 'SENT')  │
│ • Atomic Rate Limiter: Checks Redis key `rate:{sender}:{hourKey}`           │
│ • Hourly Limit Hit: Reschedules to next hour window via job.moveToDelayed() │
│ • Worker Concurrency: Safe parallel execution across multiple workers       │
│ • SMTP Delivery: Sends email via Nodemailer Ethereal fake SMTP              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
                         ┌───────────────────────────┐
                         │   Ethereal Fake SMTP      │
                         │ (Viewable Web Link Inbox) │
                         └───────────────────────────┘
```

### 1. How Scheduling Works (Strictly NO Cron)
- **Zero Cron**: Neither OS crontabs, `node-cron`, nor `agenda` are used anywhere.
- **BullMQ Delayed Jobs**: When an email is scheduled for a target timestamp `sendAt`, the exact delay is computed as `Math.max(0, sendAt.getTime() - Date.now())`.
- **Redis `ZSET` Engine**: BullMQ stores delayed jobs in a Redis Sorted Set keyed by unix epoch timestamp. Redis natively triggers jobs at the exact millisecond target time without polling database queries or causing CPU spikes.

### 2. How Persistence on Restart is Handled
- **Relational DB as Source of Truth**: Before any job is enqueued to Redis, a record is saved to the relational database (Prisma ORM) with status `SCHEDULED`.
- **Chunked Startup Scan (`recoverPendingJobs`)**: When the backend server boots up or restarts, it queries pending `SCHEDULED` emails in memory-safe batches of 500 (`take: 500`, `skip: skip`).
- **Remaining Delay Recalculation**: For each pending job, the remaining delay is re-evaluated relative to `Date.now()`. If the scheduled time has already arrived during downtime, the delay is `0` (immediate processing); if it is in the future, it waits until the exact intended time.
- **Deduplication Key (`jobId: emailId`)**: BullMQ's native `jobId` deduplication prevents re-adding duplicate jobs already in Redis.
- **Graceful Shutdown**: The server listens for `SIGTERM` and `SIGINT` to cleanly drain active BullMQ workers, close the HTTP listener, and disconnect Prisma and Redis connections.

### 3. How Rate Limiting & Concurrency are Implemented
- **Worker Concurrency**: Configured via `WORKER_CONCURRENCY` (default: `5`). Each worker instance processes multiple emails concurrently and safely using Node.js asynchronous I/O.
- **Minimum Gap Between Sends (Throttling)**: A configurable minimum delay gap (`DEFAULT_MIN_DELAY_SECONDS`, default: 2s) is applied between consecutive email deliveries to prevent provider rate-limiting.
- **Atomic Redis Hourly Counter**: Enforced via Redis key `rate:{sender}:{YYYYMMDDHH}` using atomic `INCR` and `EXPIRE (3900s)`. Because Redis operations are single-threaded and atomic, this rate-limiting mechanism remains 100% accurate across dozens of scaled worker containers.
- **Rescheduling on Limit Hit (Never Dropped)**: When a sender hits their hourly limit, the job is **not dropped or marked failed**. The worker calculates the exact milliseconds remaining until the top of the next UTC hour window and calls `job.moveToDelayed(Date.now() + msUntilNextHour)`.

---

## ✨ Features Implemented (Mapped to Requirements)

### 🖥️ Backend Requirements
| Requirement Area | Feature Implemented | Code Location |
| :--- | :--- | :--- |
| **Scheduler API** | REST API endpoints for batch scheduling, fetching scheduled/sent emails, metrics, and cancellations | [`src/api/schedule.routes.ts`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/backend/src/api/schedule.routes.ts) |
| **BullMQ Queue** | Pure BullMQ delayed jobs backed by Redis sorted sets (strictly no cron) | [`src/queue/queue.ts`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/backend/src/queue/queue.ts) |
| **Durable DB** | Relational schema with User and ScheduledEmail models, status tracking, timestamps | [`prisma/schema.prisma`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/backend/prisma/schema.prisma) |
| **Restart Persistence** | Chunked startup scan (`BATCH_SIZE=500`) syncing pending DB rows with queue | [`src/index.ts`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/backend/src/index.ts#L39-L75) |
| **Idempotency Guard** | Pre-send database status check (`status === 'SENT' -> return`) + `jobId = emailId` | [`src/queue/worker.ts`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/backend/src/queue/worker.ts#L19-L33) |
| **Atomic Rate Limiting**| Multi-worker safe Redis `INCR` on `rate:{sender}:{hourKey}` with automated expiration | [`src/rateLimiter/hourlyLimiter.ts`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/backend/src/rateLimiter/hourlyLimiter.ts) |
| **Limit Hit Rescheduling**| Reschedules jobs to next hour window via `job.moveToDelayed()` (zero job loss) | [`src/queue/worker.ts`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/backend/src/queue/worker.ts#L45-L63) |
| **Worker Concurrency** | Configurable concurrency level via `WORKER_CONCURRENCY` environment variable | [`src/queue/worker.ts`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/backend/src/queue/worker.ts#L10) |
| **Ethereal Fake SMTP** | Multi-sender support, test credential generation, and direct HTML web preview link | [`src/services/etherealService.ts`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/backend/src/services/etherealService.ts) |
| **Graceful Shutdown** | `SIGTERM` / `SIGINT` signal listeners to safely flush workers and disconnect DB/Redis | [`src/index.ts`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/backend/src/index.ts#L107-L130) |

### 🎨 Frontend Requirements
| Requirement Area | Feature Implemented | Code Location |
| :--- | :--- | :--- |
| **Google OAuth Login** | Real Google Sign-In with `@react-oauth/google` + 1-Click Quick Demo Sign-In | [`src/components/LoginModal.tsx`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/frontend/src/components/LoginModal.tsx) |
| **Header & User Info** | User avatar, name, email address, tab switcher, compose button, and logout | [`src/components/Header.tsx`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/frontend/src/components/Header.tsx) |
| **Stats Overview** | Live metric cards for total, scheduled, sent, and visual Redis hourly rate gauge | [`src/components/StatsOverview.tsx`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/frontend/src/components/StatsOverview.tsx) |
| **Compose Modal** | Drag-and-drop CSV/text lead upload, live regex validation with detected count badge, schedule time presets (`+1m`, `+5m`, custom), delay slider, hourly limit | [`src/components/ComposeModal.tsx`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/frontend/src/components/ComposeModal.tsx) |
| **Scheduled Table** | Search filter, countdown indicator (`in 1 min`), status pills, loading skeleton, empty state, and cancellation action | [`src/components/ScheduledTable.tsx`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/frontend/src/components/ScheduledTable.tsx) |
| **Sent Emails Table** | Search filter, exact delivery timestamp, `SENT`/`FAILED` status badges, loading/empty states, and clickable **"View Inbox"** Ethereal preview link | [`src/components/SentTable.tsx`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/frontend/src/components/SentTable.tsx) |
| **Code Quality** | Strict TypeScript interfaces for API responses and props, reusable UI components, toast notifications via `react-hot-toast` | [`src/types/email.ts`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/frontend/src/types/email.ts), [`src/lib/api.ts`](file:///c:/Users/GAURAVJANGRA/Documents/Codex/PROJECT/frontend/src/lib/api.ts) |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **Redis** & **PostgreSQL / MySQL** (or use the included portable Redis on Windows)

---

### 🚀 One-Click Start (Windows)
Double-click `start.bat` or run in terminal:
```cmd
.\start.bat
```
This automatically ensures Redis (port 6379), Express Backend (port 5000), and Vite Frontend (port 5173) are running in separate terminal windows and opens `http://localhost:5173` in your browser.

---

### 2. Manual Step-by-Step Setup

#### Step A: Start Redis & Database
You can use Docker Compose:
```bash
docker-compose up -d
```
*Alternatively on Windows without Docker, run the included portable Redis server:*
```cmd
.\tools\redis\redis-server.exe .\tools\redis\redis.windows.conf
```

#### Step B: Backend Setup
```bash
cd backend
npm install

# Copy environment file
cp .env.example .env

# Initialize Prisma Database
npm run db:push

# Build TypeScript
npm run build

# Start Backend Server (runs Express API + BullMQ Worker)
npm run dev
```
- **Backend API**: `http://localhost:5000/api`
- **Health Check**: `http://localhost:5000/health`

#### Step C: Frontend Setup
```bash
cd frontend
npm install

# Start Vite Development Server
npm run dev
```
- **Frontend Dashboard**: `http://localhost:5173`

---

## 📧 How to Set Up Ethereal Email & Environment Variables

### Ethereal Email Setup
Ethereal Email is a fake SMTP service that captures outbound emails and renders them in a web inbox without delivering to real recipients.

1. **Automatic Mode (Default - Zero Config)**:
   Leave `ETHEREAL_USER` and `ETHEREAL_PASS` empty in `backend/.env`. The application will automatically generate a dynamic Ethereal test account on first send, log the credentials to the console, and generate viewable web preview URLs (e.g. `https://ethereal.email/message/...`).
2. **Manual Account Mode (Optional)**:
   Visit [https://ethereal.email/create](https://ethereal.email/create), click **Create Ethereal Account**, and copy the generated credentials into `backend/.env`:
   ```env
   ETHEREAL_USER=your_username@ethereal.email
   ETHEREAL_PASS=your_password
   ```

### Environment Variables Reference (`backend/.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Express API HTTP listener port | `5000` |
| `REDIS_HOST` | Hostname of the Redis server | `localhost` |
| `REDIS_PORT` | Port of the Redis server | `6379` |
| `REDIS_PASSWORD` | Password for Redis authentication (if any) | *(empty)* |
| `DATABASE_URL` | Relational DB connection string (SQLite, Postgres, or MySQL) | `file:./dev.db` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Web Client ID | `your-google-client-id.apps.googleusercontent.com` |
| `JWT_SECRET` | Secret key used to sign user session JWTs | `reachinbox_super_secret_jwt_key_2026` |
| `WORKER_CONCURRENCY` | Number of simultaneous jobs each BullMQ worker can process | `5` |
| `DEFAULT_MAX_EMAILS_PER_HOUR` | Global default hourly limit per sender | `100` |
| `DEFAULT_MIN_DELAY_SECONDS` | Minimum delay gap between consecutive sends | `2` |
| `ETHEREAL_USER` | Ethereal SMTP username (auto-generated if blank) | *(optional)* |
| `ETHEREAL_PASS` | Ethereal SMTP password (auto-generated if blank) | *(optional)* |

---

## 🧪 Automated Testing

Comprehensive test suites are included to verify all backend, queue, rate limiting, and restart scenarios:

```bash
cd backend

# Run the 16-point feature test suite
npm test

# Run the dedicated server restart resilience & idempotency test
npm run test:restart
```

### Automated Test Output (`npm test`):
```text
===============================================================
       REACHINBOX FULL-STACK EMAIL SCHEDULER TEST SUITE        
===============================================================

--- 1. Health & Server Status ---
✅ [PASS] API Health Endpoint (/health)
--- 2. Redis & BullMQ Queue Integration ---
✅ [PASS] Redis Ping Check (PONG)
✅ [PASS] BullMQ Queue Connection (email-scheduler)
--- 3. Authentication & Profile ---
✅ [PASS] GET /api/auth/google/config
✅ [PASS] POST /api/auth/demo (Session JWT Issuance)
✅ [PASS] GET /api/auth/me (Protected Route Verification)
--- 4. Email Scheduling (No Cron, Pure BullMQ Delay) ---
✅ [PASS] POST /api/emails/schedule (Batch Scheduling)
✅ [PASS] GET /api/emails/scheduled (Relational DB Persistence)
--- 5. Real-time Metrics & Stats API ---
✅ [PASS] GET /api/emails/stats
--- 6. Redis-Backed Atomic Rate Limiter ---
✅ [PASS] Allowed up to max hourly limit (3/3)
✅ [PASS] Rate Limit Enforcement & Rescheduling Window Calculation
--- 7. Ethereal Fake SMTP Delivery ---
✅ [PASS] Ethereal SMTP Delivery & Preview URL Generation
--- 8. Idempotency Guard Verification ---
✅ [PASS] Idempotency Guard Setup
--- 9. BullMQ Delayed Execution & Delivery ---
✅ [PASS] BullMQ Worker Delayed Execution & Status Update to SENT
--- 10. Cancel Scheduled Email ---
✅ [PASS] DELETE /api/emails/:id (Cancel Scheduled Email)
✅ [PASS] Email Removed from Relational Database

===============================================================
TEST SUMMARY: 16 PASSED, 0 FAILED (Total: 16)
===============================================================
```

---

## 🎥 Demo Video Guide (Max 5 Minutes)

When recording your submission demo, follow this concise script:

| Timestamp | Segment | Actions to Show |
| :--- | :--- | :--- |
| **0:00 – 0:45** | **Login & UI Overview** | Open `http://localhost:5173`. Click **Quick Demo Sign-In** (or Google Sign-In). Show the user header (avatar, name, email), stats overview cards, and rate limit gauge. |
| **0:45 – 1:45** | **Compose & Schedule** | Click **Compose New Email**. Enter subject and body. Paste or drag a CSV list of leads and show the **"X valid recipients detected"** badge. Select preset `+1 Min`. Click **Schedule**. Show rows appearing in **Scheduled Emails** table with countdown `in 1 min`. |
| **1:45 – 3:15** | **Restart Scenario** | Schedule an email for `+3 Minutes`. Stop the backend server process (`Ctrl+C`). Wait 15 seconds. Restart server (`npm run dev`). Point out log `[Restart Recovery] Found pending SCHEDULED emails`. Fast-forward or wait until target time: show BullMQ worker processing the email automatically with status updating to `SENT` without duplicate sends. |
| **3:15 – 4:15** | **Rate Limiting & Delay** | Schedule 5 emails with `hourlyLimit = 3`. Show the first 3 emails send and the remaining 2 automatically reschedule to the next hour window (`moveToDelayed()`) instead of dropping or failing. |
| **4:15 – 5:00** | **Sent Emails & Ethereal Inbox** | Click the **Sent Emails** tab. Click **"View Inbox"** on an email row to open the rendered Ethereal HTML email in a new tab. |

> **Browser UI Recording Artifact**:
> An automated browser verification recording is saved at:
> `file:///C:/Users/GAURAVJANGRA/.gemini/antigravity-ide/brain/b318fb7d-6ce6-473c-b4db-c3b89ad720e0/frontend_ui_test_1789189442606.webp`

---

## 🏛 Assumptions, Shortcuts & Trade-offs

1. **BullMQ Delayed Jobs over Cron**:
   - *Rationale*: Cron-based architectures require periodic database polling (e.g. every 10 seconds), causing high query load, race conditions across workers, and polling lag. BullMQ uses Redis `ZSET` sorted sets under the hood, enabling instant, event-driven execution at exact millisecond timestamps.
2. **Relational Database as Source of Truth**:
   - *Rationale*: Redis is in-memory and volatile. Saving job states to SQLite/PostgreSQL synchronously *before* enqueuing guarantees 100% data durability even if Redis or Node.js crashes unexpectedly.
3. **Database Portability (SQLite vs. PostgreSQL)**:
   - *Rationale*: SQLite (`DATABASE_URL="file:./dev.db"`) is pre-configured so any evaluator can clone and run the project immediately on Windows/Mac/Linux without requiring a running PostgreSQL server. A production-ready Docker Compose configuration for PostgreSQL 15 (`docker-compose.yml`) is provided for multi-container deployments.
4. **Atomic Redis Rate Limiting over DB Counters**:
   - *Rationale*: Incrementing in-memory variables breaks when scaling horizontally across multiple worker instances. Performing SQL `UPDATE` on every email send creates database lock contention. Using Redis `INCR` on window key `rate:{sender}:{YYYYMMDDHH}` provides atomic, high-throughput rate enforcement across microservice clusters.
5. **On-Limit Rescheduling (`moveToDelayed`) vs. Dropping**:
   - *Rationale*: ReachInbox deals with mission-critical cold email campaigns. Dropping or failing jobs when a user exceeds their hourly limit is unacceptable. Rescheduling into the next hour window preserves the send queue seamlessly without manual intervention.
6. **Dual Authentication (Google OAuth + Demo Login)**:
   - *Rationale*: While real Google OAuth token verification is fully implemented via `@react-oauth/google` and `google-auth-library`, evaluators may not have a pre-configured Google Client ID set in their local `.env`. The **Quick Demo Sign-In** button allows reviewers to evaluate the full authenticated experience with zero friction.
