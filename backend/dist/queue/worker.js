"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWorker = setupWorker;
const bullmq_1 = require("bullmq");
const client_1 = require("../db/client");
const queue_1 = require("./queue");
const hourlyLimiter_1 = require("../rateLimiter/hourlyLimiter");
const etherealService_1 = require("../services/etherealService");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
function setupWorker() {
    const worker = new bullmq_1.Worker(queue_1.QUEUE_NAME, async (job) => {
        const { emailId } = job.data;
        console.log(`[Worker] Processing job ${job.id} for emailId: ${emailId}`);
        // 1. Idempotency Guard: Check DB state
        const email = await client_1.prisma.scheduledEmail.findUnique({
            where: { id: emailId },
        });
        if (!email) {
            console.warn(`[Worker] Email record not found in DB: ${emailId}`);
            return;
        }
        if (email.status === 'SENT') {
            console.log(`[Worker] Idempotency Guard triggered: Email ${emailId} is already SENT. Skipping.`);
            return;
        }
        // 2. Delay between sends (configured per email or default env)
        const minDelaySeconds = email.delaySeconds || parseInt(process.env.DEFAULT_MIN_DELAY_SECONDS || '2', 10);
        if (minDelaySeconds > 0) {
            console.log(`[Worker] Applying configured delay of ${minDelaySeconds}s for emailId: ${emailId}`);
            await new Promise((resolve) => setTimeout(resolve, minDelaySeconds * 1000));
        }
        // 3. Hourly Rate Limit Check
        const maxLimit = email.hourlyLimit || parseInt(process.env.DEFAULT_MAX_EMAILS_PER_HOUR || '100', 10);
        const rateCheck = await (0, hourlyLimiter_1.checkAndIncrementHourlyLimit)(queue_1.redisConnection, email.sender, maxLimit);
        if (!rateCheck.allowed) {
            console.warn(`[Worker] Rate limit exceeded for sender "${email.sender}" (${rateCheck.count}/${rateCheck.max}). ` +
                `Rescheduling job ${job.id} to next hour window in ${Math.round(rateCheck.msUntilNextHour / 1000)}s.`);
            // Update DB status to reflect rate limit delay
            await client_1.prisma.scheduledEmail.update({
                where: { id: emailId },
                data: {
                    status: 'SCHEDULED',
                    errorMessage: `Hourly rate limit of ${maxLimit} reached. Rescheduled to next hour window.`,
                },
            });
            // Reschedule BullMQ job to next hour window
            await job.moveToDelayed(Date.now() + rateCheck.msUntilNextHour, job.token);
            return;
        }
        // 4. Mark DB state as SENDING
        await client_1.prisma.scheduledEmail.update({
            where: { id: emailId },
            data: {
                status: 'SENDING',
                attempts: { increment: 1 },
            },
        });
        // 5. Send Email via Ethereal SMTP
        try {
            const sendResult = await (0, etherealService_1.sendViaEthereal)({
                from: email.sender,
                to: email.recipient,
                subject: email.subject,
                html: email.body,
            });
            // 6. Mark DB state as SENT
            await client_1.prisma.scheduledEmail.update({
                where: { id: emailId },
                data: {
                    status: 'SENT',
                    sentAt: new Date(),
                    etherealUrl: sendResult.previewUrl || null,
                    errorMessage: null,
                },
            });
            console.log(`[Worker] Successfully sent email ${emailId} to ${email.recipient}`);
        }
        catch (err) {
            console.error(`[Worker] Error sending email ${emailId}:`, err);
            await client_1.prisma.scheduledEmail.update({
                where: { id: emailId },
                data: {
                    status: 'FAILED',
                    errorMessage: err?.message || 'SMTP sending error',
                },
            });
            throw err;
        }
    }, {
        connection: queue_1.redisConnection,
        concurrency,
    });
    worker.on('completed', (job) => {
        console.log(`[Worker] Job ${job.id} completed.`);
    });
    worker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
    });
    console.log(`[Worker] BullMQ Worker initialized with concurrency = ${concurrency}`);
    return worker;
}
