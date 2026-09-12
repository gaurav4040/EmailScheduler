import { Router, Request, Response } from 'express';
import { prisma } from '../db/client';
import { enqueueEmailJob } from '../queue/queue';
import { getCurrentHourlyUsage } from '../rateLimiter/hourlyLimiter';
import { redisConnection } from '../queue/queue';

const router = Router();

// Email address validation helper
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// POST /api/emails/schedule - Enqueue batch of emails for specific sendAt time
router.post('/schedule', async (req: Request, res: Response) => {
  try {
    const {
      recipients,
      subject,
      body,
      sender = 'outbox@reachinbox.ai',
      sendAt,
      delaySeconds = 2,
      hourlyLimit = 100,
    } = req.body;

    if (!subject || !body || !sendAt) {
      return res.status(400).json({ error: 'Missing required fields: subject, body, sendAt' });
    }

    let recipientList: string[] = [];
    if (Array.isArray(recipients)) {
      recipientList = recipients.map((r) => String(r).trim()).filter(isValidEmail);
    } else if (typeof recipients === 'string') {
      recipientList = recipients
        .split(/[\n,;]+/)
        .map((r) => r.trim())
        .filter(isValidEmail);
    }

    if (recipientList.length === 0) {
      return res.status(400).json({ error: 'No valid recipient email addresses provided' });
    }

    const targetDate = new Date(sendAt);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'Invalid sendAt date string' });
    }

    // De-duplicate recipient list
    const uniqueRecipients = Array.from(new Set(recipientList));
    console.log(`[Schedule API] Scheduling ${uniqueRecipients.length} emails for target time: ${targetDate.toISOString()}`);

    const createdEmails = [];
    let enqueuedCount = 0;

    // Save each email to relational database synchronously first (durable source of truth)
    for (let i = 0; i < uniqueRecipients.length; i++) {
      const recipient = uniqueRecipients[i];
      
      // Calculate stagger if delaySeconds is specified
      const staggeredSendAt = new Date(targetDate.getTime() + i * delaySeconds * 1000);

      const emailRecord = await prisma.scheduledEmail.create({
        data: {
          recipient,
          subject,
          body,
          sender: sender.trim(),
          sendAt: staggeredSendAt,
          delaySeconds: Number(delaySeconds),
          hourlyLimit: Number(hourlyLimit),
          status: 'SCHEDULED',
        },
      });

      // Enqueue delayed job in BullMQ backed by Redis
      const enqueued = await enqueueEmailJob(emailRecord.id, staggeredSendAt);
      if (enqueued) enqueuedCount++;

      createdEmails.push(emailRecord);
    }

    res.status(201).json({
      success: true,
      message: `Successfully scheduled ${createdEmails.length} emails (${enqueuedCount} enqueued in BullMQ queue)`,
      count: createdEmails.length,
      emails: createdEmails,
    });
  } catch (err: any) {
    console.error('[Schedule API] Error scheduling emails:', err);
    res.status(500).json({ error: err?.message || 'Failed to schedule emails' });
  }
});

// GET /api/emails/scheduled - Get upcoming scheduled emails
router.get('/scheduled', async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      status: { in: ['SCHEDULED', 'SENDING'] },
    };

    if (search) {
      whereCondition.OR = [
        { recipient: { contains: search } },
        { subject: { contains: search } },
        { sender: { contains: search } },
      ];
    }

    const [emails, total] = await Promise.all([
      prisma.scheduledEmail.findMany({
        where: whereCondition,
        orderBy: { sendAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.scheduledEmail.count({ where: whereCondition }),
    ]);

    res.json({
      success: true,
      emails,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to fetch scheduled emails' });
  }
});

// GET /api/emails/sent - Get sent/failed email log
router.get('/sent', async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      status: { in: ['SENT', 'FAILED'] },
    };

    if (search) {
      whereCondition.OR = [
        { recipient: { contains: search } },
        { subject: { contains: search } },
        { sender: { contains: search } },
      ];
    }

    const [emails, total] = await Promise.all([
      prisma.scheduledEmail.findMany({
        where: whereCondition,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.scheduledEmail.count({ where: whereCondition }),
    ]);

    res.json({
      success: true,
      emails,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to fetch sent emails' });
  }
});

// GET /api/emails/stats - System stats and rate limit info
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const defaultSender = 'outbox@reachinbox.ai';
    const [scheduledCount, sentCount, failedCount, rateInfo] = await Promise.all([
      prisma.scheduledEmail.count({ where: { status: { in: ['SCHEDULED', 'SENDING'] } } }),
      prisma.scheduledEmail.count({ where: { status: 'SENT' } }),
      prisma.scheduledEmail.count({ where: { status: 'FAILED' } }),
      getCurrentHourlyUsage(redisConnection, defaultSender),
    ]);

    res.json({
      success: true,
      stats: {
        scheduled: scheduledCount,
        sent: sentCount,
        failed: failedCount,
        total: scheduledCount + sentCount + failedCount,
        hourlySentCount: rateInfo.count,
        hourlyLimitMax: parseInt(process.env.DEFAULT_MAX_EMAILS_PER_HOUR || '100', 10),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to fetch stats' });
  }
});

// DELETE /api/emails/:id - Cancel a scheduled email
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const email = await prisma.scheduledEmail.findUnique({ where: { id } });

    if (!email) return res.status(404).json({ error: 'Email record not found' });
    if (email.status === 'SENT') {
      return res.status(400).json({ error: 'Cannot cancel an email that has already been sent' });
    }

    await prisma.scheduledEmail.delete({ where: { id } });
    res.json({ success: true, message: 'Email cancelled and removed' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to cancel email' });
  }
});

export default router;
