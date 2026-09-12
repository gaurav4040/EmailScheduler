# ReachInbox Full-Stack Email Job Scheduler

Production-grade email scheduler service and dashboard built for the ReachInbox.ai (Outbox Labs) Software Development Intern Assignment.

---

## 📌 Architecture Overview

```
                          ┌──────────────────────────┐
                          │   React / Next.js UI     │
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

---

## ✨ Features & Requirements Checklist

### Backend Requirements
- [x] **Strictly NO Cron**: Scheduled purely via BullMQ delayed jobs (`{ delay: sendAt.getTime() - Date.now(), jobId: emailId }`). Zero OS crontabs or cron packages.
- [x] **Durable Relational Database**: Saves scheduled emails to DB before queueing to ensure zero loss across server restarts.
- [x] **Process Restart Resilience**: On startup, pending `SCHEDULED` DB records are synced with Redis to guarantee delivery even if the process restarts mid-queue.
- [x] **Idempotency Guard**: BullMQ worker checks DB status prior to execution. If `status === 'SENT'`, the job is skipped immediately to prevent double sends.
- [x] **Redis-Backed Atomic Hourly Rate Limiting**: Per-sender hourly key `rate:{sender}:{hourKey}` enforced via Redis `INCR` + `EXPIRE`. Correct across multiple concurrent worker instances.
- [x] **On Limit Hit Rescheduling**: When hourly cap is exceeded, job is rescheduled to the top of the next hour window via `job.moveToDelayed()`; jobs are never dropped.
- [x] **Worker Concurrency**: Configurable via `WORKER_CONCURRENCY` environment variable.
- [x] **Ethereal Fake SMTP Integration**: Automatically generates test credentials and returns real web preview URLs (`etherealUrl`) to view rendered emails in browser.
- [x] **Google OAuth 2.0 Auth**: Token verification API endpoints (`/api/auth/google`) and user profile decoding.

### Frontend Dashboard
- [x] **Google OAuth 2.0 Login**: Real Google Sign-In button + Quick Demo Sign-In mode.
- [x] **Header & User Profile**: User name, email, avatar image, tab switcher, and compose button.
- [x] **Scheduled Emails Table**: Real-time listing with search filter, countdown indicator (`in X mins`), status pills, and cancellation action.
- [x] **Sent Emails Table**: Sent & Failed delivery logs with exact timestamp and direct **"View Inbox"** link to rendered Ethereal web preview.
- [x] **Compose Modal**: CSV / Text drag-and-drop lead parser with live detected valid address feedback badge, date-time scheduler (+1 min, +5 min, custom), min delay gap, and hourly cap settings.
- [x] **System Stats Banner**: Real-time metric cards and Redis hourly rate limit usage progress gauge.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js (v18+)
- Redis & PostgreSQL / MySQL (or Docker Compose)

### 🚀 One-Click Start (Windows)
Simply double click `start.bat` or run:
```bash
.\start.bat
```
This automatically ensures Redis (port 6379), Express Backend (port 5000), and Vite Frontend (port 5173) are running and opens the dashboard in your browser.

### 2. Infrastructure Setup (Docker or Local Redis)
Run Redis and PostgreSQL containers using Docker Compose:
```bash
docker-compose up -d
```
*(Or use the included native Windows Redis server in `tools/redis/redis-server.exe`)*

### 3. Backend Setup
```bash
cd backend
npm install

# Copy environment variables
cp .env.example .env

# Initialize Prisma Database
npm run db:push

# Build TypeScript
npm run build

# Start Backend Server (runs Express API + BullMQ Worker)
npm run dev
```
> **Backend URL**: `http://localhost:5000`  
> **Health Check**: `http://localhost:5000/health`

### 4. Frontend Setup
```bash
cd frontend
npm install

# Start Vite Development Server
npm run dev
```
> **Frontend Dashboard URL**: `http://localhost:5173`

---

## 🛠 Environment Variables (`backend/.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Express API HTTP port | `5000` |
| `REDIS_HOST` | Redis Server Host | `localhost` |
| `REDIS_PORT` | Redis Server Port | `6379` |
| `DATABASE_URL` | Relational DB Connection String (Postgres/MySQL/SQLite) | `file:./dev.db` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | `your-google-client-id` |
| `JWT_SECRET` | Secret key for session JWTs | `reachinbox_secret` |
| `WORKER_CONCURRENCY` | Parallel jobs per worker process | `5` |
| `DEFAULT_MAX_EMAILS_PER_HOUR` | Default hourly limit per sender | `100` |
| `DEFAULT_MIN_DELAY_SECONDS` | Minimum delay gap between email sends | `2` |

---

## 🧪 Demonstrating the Server Restart Scenario

To test and record the restart scenario for submission evaluation:

1. Open the frontend dashboard (`http://localhost:5173`) and click **Compose New Email**.
2. Upload/Enter lead email addresses (e.g. `lead1@domain.com`, `lead2@domain.com`).
3. Set schedule start time to **In 5 Minutes**.
4. Click **Schedule Emails**. Observe the new rows in the **Scheduled Emails** table with status `SCHEDULED`.
5. Stop the backend server process (`Ctrl + C` in backend terminal).
6. Wait 30 seconds.
7. Restart the backend server (`npm run dev`).
8. Notice startup logs:
   ```
   [Restart Recovery] Found 2 pending SCHEDULED emails in database.
   [Restart Recovery] Completed queue recovery scan for 2 emails.
   ```
9. Watch the frontend dashboard: when target time arrives, BullMQ processes the jobs automatically without duplicate sends or dropped items!

---

## 🏛 Design Decisions & Trade-offs

1. **BullMQ Delayed Jobs over Cron**: Cron jobs poll databases periodically (e.g., every 10 seconds), causing database query spikes under high load. BullMQ uses Redis `ZSET` sorted sets under the hood, enabling instant event-driven execution at exact millisecond target times.
2. **Relational Database as Source of Truth**: Redis is in-memory and volatile. Saving job states to Postgres/MySQL synchronously *before* enqueuing guarantees 100% data durability even if Redis or Node.js crashes unexpectedly.
3. **Atomic Redis Rate Limiting**: In-memory rate limiting breaks when scaling to multiple backend worker instances. Using Redis `INCR` on window key `rate:{sender}:{hourKey}` guarantees atomic rate enforcement across scaled microservice workers.
