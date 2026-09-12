import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './api/auth.routes';
import scheduleRoutes from './api/schedule.routes';
import { setupWorker } from './queue/worker';
import { prisma } from './db/client';
import { enqueueEmailJob } from './queue/queue';

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '5000', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'reachinbox-email-scheduler',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/emails', scheduleRoutes);

// Global Error Handling Middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err?.message,
  });
});

// Startup Recovery Helper: Re-enqueues pending SCHEDULED emails from DB in safe batches on restart
async function recoverPendingJobs() {
  const BATCH_SIZE = 500;
  let skip = 0;
  let totalRecovered = 0;

  try {
    const totalCount = await prisma.scheduledEmail.count({ where: { status: 'SCHEDULED' } });
    if (totalCount === 0) return;

    console.log(`[Restart Recovery] Found ${totalCount} pending SCHEDULED emails. Beginning recovery scan...`);

    while (skip < totalCount) {
      const batch = await prisma.scheduledEmail.findMany({
        where: { status: 'SCHEDULED' },
        skip,
        take: BATCH_SIZE,
        orderBy: { sendAt: 'asc' },
      });

      if (batch.length === 0) break;

      for (const email of batch) {
        await enqueueEmailJob(email.id, email.sendAt);
        totalRecovered++;
      }

      skip += BATCH_SIZE;
    }

    console.log(`[Restart Recovery] Successfully recovered and enqueued ${totalRecovered} pending jobs.`);
  } catch (err: any) {
    console.warn('[Restart Recovery] Startup recovery note:', err?.message || err);
  }
}

// Start Server & Queue Worker
let activeWorker: ReturnType<typeof setupWorker> | null = null;

async function startServer() {
  try {
    // 1. Connect to relational DB
    await prisma.$connect();
    console.log('[Database] Connected to relational database via Prisma');

    // 2. Start listening on HTTP port immediately
    const server = app.listen(port, () => {
      console.log(`===================================================`);
      console.log(` ReachInbox Email Scheduler Service running on port ${port}`);
      console.log(` API Base URL: http://localhost:${port}/api`);
      console.log(` Health Check: http://localhost:${port}/health`);
      console.log(`===================================================`);
    });

    // 3. Initialize worker & recovery in background
    setTimeout(async () => {
      await recoverPendingJobs();
      try {
        activeWorker = setupWorker();
      } catch (err: any) {
        console.warn('[Worker Setup] Worker notice:', err?.message || err);
      }
    }, 500);

    // 4. Graceful Shutdown Handlers (Production Readiness)
    const handleShutdown = async (signal: string) => {
      console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown...`);
      server.close(async () => {
        console.log('[Shutdown] HTTP listener closed.');
        try {
          if (activeWorker) {
            await activeWorker.close();
            console.log('[Shutdown] BullMQ worker paused and closed.');
          }
          await prisma.$disconnect();
          console.log('[Shutdown] Relational database connection disconnected.');
          console.log('[Shutdown] Clean exit complete.');
          process.exit(0);
        } catch (err) {
          console.error('[Shutdown Error]', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

  } catch (err) {
    console.error('[Server Startup] Error during startup:', err);
    process.exit(1);
  }
}

startServer();

