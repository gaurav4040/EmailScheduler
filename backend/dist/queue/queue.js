"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailQueue = exports.QUEUE_NAME = exports.redisConnection = void 0;
exports.enqueueEmailJob = enqueueEmailJob;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;
exports.redisConnection = new ioredis_1.default({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy(times) {
        // Retry connecting to Redis periodically without crashing process
        const delay = Math.min(times * 100, 3000);
        return delay;
    },
});
exports.redisConnection.on('connect', () => {
    console.log(`[Redis] Connected to Redis at ${redisHost}:${redisPort}`);
});
exports.redisConnection.on('error', (err) => {
    console.warn(`[Redis Connection Warning] ${err.message}`);
});
exports.QUEUE_NAME = 'email-scheduler';
exports.emailQueue = new bullmq_1.Queue(exports.QUEUE_NAME, {
    connection: exports.redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
    },
});
async function enqueueEmailJob(emailId, sendAt) {
    const now = Date.now();
    const targetTime = sendAt.getTime();
    const delay = Math.max(0, targetTime - now);
    try {
        if (exports.redisConnection.status === 'ready' || exports.redisConnection.status === 'connect') {
            await exports.emailQueue.add('send-email', { emailId }, {
                delay,
                jobId: emailId, // Idempotency key
            });
            console.log(`[Queue] Enqueued job in BullMQ for emailId: ${emailId} (delay: ${delay}ms)`);
            return true;
        }
        else {
            console.warn(`[Queue] Redis status is "${exports.redisConnection.status}". Database record saved; job will execute via fallback processing.`);
            return true;
        }
    }
    catch (err) {
        console.warn(`[Queue Warning] Enqueue note for job ${emailId}:`, err?.message || err);
        return true;
    }
}
