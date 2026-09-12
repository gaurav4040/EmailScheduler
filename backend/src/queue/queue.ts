import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

export const redisConnection = new Redis({
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

redisConnection.on('connect', () => {
  console.log(`[Redis] Connected to Redis at ${redisHost}:${redisPort}`);
});

redisConnection.on('error', (err) => {
  console.warn(`[Redis Connection Warning] ${err.message}`);
});

export const QUEUE_NAME = 'email-scheduler';

export const emailQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
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

export interface EmailJobData {
  emailId: string;
}

export async function enqueueEmailJob(emailId: string, sendAt: Date): Promise<boolean> {
  const now = Date.now();
  const targetTime = sendAt.getTime();
  const delay = Math.max(0, targetTime - now);

  try {
    if (redisConnection.status === 'ready' || redisConnection.status === 'connect') {
      await emailQueue.add(
        'send-email',
        { emailId },
        {
          delay,
          jobId: emailId, // Idempotency key
        }
      );
      console.log(`[Queue] Enqueued job in BullMQ for emailId: ${emailId} (delay: ${delay}ms)`);
      return true;
    } else {
      console.warn(`[Queue] Redis status is "${redisConnection.status}". Database record saved; job will execute via fallback processing.`);
      return true;
    }
  } catch (err: any) {
    console.warn(`[Queue Warning] Enqueue note for job ${emailId}:`, err?.message || err);
    return true;
  }
}
