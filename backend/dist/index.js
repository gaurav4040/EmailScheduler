"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_routes_1 = __importDefault(require("./api/auth.routes"));
const schedule_routes_1 = __importDefault(require("./api/schedule.routes"));
const worker_1 = require("./queue/worker");
const client_1 = require("./db/client");
const queue_1 = require("./queue/queue");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = parseInt(process.env.PORT || '5000', 10);
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Health Check Endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'reachinbox-email-scheduler',
        timestamp: new Date().toISOString(),
    });
});
// API Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/emails', schedule_routes_1.default);
// Global Error Handling Middleware
app.use((err, _req, res, _next) => {
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
        const totalCount = await client_1.prisma.scheduledEmail.count({ where: { status: 'SCHEDULED' } });
        if (totalCount === 0)
            return;
        console.log(`[Restart Recovery] Found ${totalCount} pending SCHEDULED emails. Beginning recovery scan...`);
        while (skip < totalCount) {
            const batch = await client_1.prisma.scheduledEmail.findMany({
                where: { status: 'SCHEDULED' },
                skip,
                take: BATCH_SIZE,
                orderBy: { sendAt: 'asc' },
            });
            if (batch.length === 0)
                break;
            for (const email of batch) {
                await (0, queue_1.enqueueEmailJob)(email.id, email.sendAt);
                totalRecovered++;
            }
            skip += BATCH_SIZE;
        }
        console.log(`[Restart Recovery] Successfully recovered and enqueued ${totalRecovered} pending jobs.`);
    }
    catch (err) {
        console.warn('[Restart Recovery] Startup recovery note:', err?.message || err);
    }
}
// Start Server & Queue Worker
let activeWorker = null;
async function startServer() {
    try {
        // 1. Connect to relational DB
        await client_1.prisma.$connect();
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
                activeWorker = (0, worker_1.setupWorker)();
            }
            catch (err) {
                console.warn('[Worker Setup] Worker notice:', err?.message || err);
            }
        }, 500);
        // 4. Graceful Shutdown Handlers (Production Readiness)
        const handleShutdown = async (signal) => {
            console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown...`);
            server.close(async () => {
                console.log('[Shutdown] HTTP listener closed.');
                try {
                    if (activeWorker) {
                        await activeWorker.close();
                        console.log('[Shutdown] BullMQ worker paused and closed.');
                    }
                    await client_1.prisma.$disconnect();
                    console.log('[Shutdown] Relational database connection disconnected.');
                    console.log('[Shutdown] Clean exit complete.');
                    process.exit(0);
                }
                catch (err) {
                    console.error('[Shutdown Error]', err);
                    process.exit(1);
                }
            });
        };
        process.on('SIGTERM', () => handleShutdown('SIGTERM'));
        process.on('SIGINT', () => handleShutdown('SIGINT'));
    }
    catch (err) {
        console.error('[Server Startup] Error during startup:', err);
        process.exit(1);
    }
}
startServer();
