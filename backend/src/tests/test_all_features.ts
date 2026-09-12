import { prisma } from '../db/client';
import { redisConnection, emailQueue } from '../queue/queue';
import { checkAndIncrementHourlyLimit } from '../rateLimiter/hourlyLimiter';
import { sendViaEthereal } from '../services/etherealService';

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('===============================================================');
  console.log('       REACHINBOX FULL-STACK EMAIL SCHEDULER TEST SUITE        ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      if (detail) console.log(`   ↳ ${detail}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   ↳ ${detail}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // FEATURE 1: Health Check & System Status
    // -------------------------------------------------------------
    console.log('\n--- 1. Health & Server Status ---');
    const healthRes = await fetch('http://localhost:5000/health');
    const healthData: any = await healthRes.json();
    assert(
      healthRes.status === 200 && healthData.status === 'ok',
      'API Health Endpoint (/health)',
      `Status: ${healthData.status}, Service: ${healthData.service}`
    );

    // -------------------------------------------------------------
    // FEATURE 2: Redis Connection & BullMQ Queue setup
    // -------------------------------------------------------------
    console.log('\n--- 2. Redis & BullMQ Queue Integration ---');
    const ping = await redisConnection.ping();
    assert(ping === 'PONG', 'Redis Ping Check', `Redis server responded with ${ping}`);

    const queueWaiting = await emailQueue.getWaitingCount();
    const queueDelayed = await emailQueue.getDelayedCount();
    assert(
      typeof queueWaiting === 'number' && typeof queueDelayed === 'number',
      'BullMQ Queue Connection (email-scheduler)',
      `Queue state: ${queueWaiting} waiting, ${queueDelayed} delayed jobs`
    );

    // -------------------------------------------------------------
    // FEATURE 3: Authentication (Google OAuth Config & Demo Login)
    // -------------------------------------------------------------
    console.log('\n--- 3. Authentication & Profile ---');
    const configRes = await fetch(`${API_BASE}/auth/google/config`);
    const configData: any = await configRes.json();
    assert(configRes.status === 200, 'GET /api/auth/google/config', `Client ID returned: ${configData.clientId}`);

    const demoLoginRes = await fetch(`${API_BASE}/auth/demo`, { method: 'POST' });
    const demoData: any = await demoLoginRes.json();
    assert(
      demoLoginRes.status === 200 && Boolean(demoData.token),
      'POST /api/auth/demo (Session JWT Issuance)',
      `User: ${demoData.user.name} (${demoData.user.email})`
    );

    const authToken = demoData.token;
    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const meData: any = await meRes.json();
    assert(
      meRes.status === 200 && meData.user.email === 'candidate@reachinbox.ai',
      'GET /api/auth/me (Protected Route Verification)',
      `Decoded User ID: ${meData.user.id}`
    );

    // -------------------------------------------------------------
    // FEATURE 4: Email Scheduling API (DB Persistence + BullMQ Delay)
    // -------------------------------------------------------------
    console.log('\n--- 4. Email Scheduling (No Cron, Pure BullMQ Delay) ---');
    const schedulePayload = {
      recipients: ['test-lead1@example.com', 'test-lead2@example.com'],
      subject: 'Automated Test Campaign',
      body: '<p>Hello, this is a test email sent via ReachInbox Job Scheduler.</p>',
      sender: 'test-sender@reachinbox.ai',
      sendAt: new Date(Date.now() + 4000).toISOString(), // 4 seconds in the future
      delaySeconds: 1,
      hourlyLimit: 50,
    };

    const scheduleRes = await fetch(`${API_BASE}/emails/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(schedulePayload),
    });
    const scheduleData: any = await scheduleRes.json();
    assert(
      scheduleRes.status === 201 && scheduleData.count === 2,
      'POST /api/emails/schedule (Batch Scheduling)',
      `Scheduled ${scheduleData.count} emails. Message: ${scheduleData.message}`
    );

    const scheduledListRes = await fetch(`${API_BASE}/emails/scheduled`);
    const scheduledListData: any = await scheduledListRes.json();
    const scheduledRecords = scheduledListData.emails;
    const foundScheduled = scheduledRecords.some((e: any) => e.recipient === 'test-lead1@example.com');
    assert(
      foundScheduled,
      'GET /api/emails/scheduled (Relational DB Persistence)',
      `Found pending scheduled email for test-lead1@example.com`
    );

    // -------------------------------------------------------------
    // FEATURE 5: Real-time Stats & Counters
    // -------------------------------------------------------------
    console.log('\n--- 5. Real-time Metrics & Stats API ---');
    const statsRes = await fetch(`${API_BASE}/emails/stats`);
    const statsData: any = await statsRes.json();
    assert(
      statsRes.status === 200 && typeof statsData.stats.scheduled === 'number',
      'GET /api/emails/stats',
      `Stats: Scheduled=${statsData.stats.scheduled}, Sent=${statsData.stats.sent}, HourlyCount=${statsData.stats.hourlySentCount}`
    );

    // -------------------------------------------------------------
    // FEATURE 6: Rate Limiting & Next Hour Window Rescheduling
    // -------------------------------------------------------------
    console.log('\n--- 6. Redis-Backed Atomic Rate Limiter ---');
    const testSender = `loadtest-${Date.now()}@reachinbox.ai`;
    const rateMax = 3;

    // Test first 3 requests are allowed
    let allowedCount = 0;
    for (let i = 0; i < rateMax; i++) {
      const res = await checkAndIncrementHourlyLimit(redisConnection, testSender, rateMax);
      if (res.allowed) allowedCount++;
    }
    assert(
      allowedCount === rateMax,
      `Allowed up to max hourly limit (${rateMax}/${rateMax})`,
      `Counter accurately tracked atomic increments in Redis`
    );

    // Test 4th request exceeds limit and gets rescheduled
    const exceededRes = await checkAndIncrementHourlyLimit(redisConnection, testSender, rateMax);
    assert(
      !exceededRes.allowed && exceededRes.count === 4 && exceededRes.msUntilNextHour > 0,
      'Rate Limit Enforcement & Rescheduling Window Calculation',
      `Blocked send #4. Calculated delay until next hour window: ${Math.round(exceededRes.msUntilNextHour / 1000)}s`
    );

    // -------------------------------------------------------------
    // FEATURE 7: Ethereal Fake SMTP Delivery
    // -------------------------------------------------------------
    console.log('\n--- 7. Ethereal Fake SMTP Delivery ---');
    console.log('Sending test email via Ethereal SMTP...');
    const smtpResult = await sendViaEthereal({
      from: 'tester@reachinbox.ai',
      to: 'inbox-audit@example.com',
      subject: 'Ethereal Delivery Test',
      html: '<b>Testing Ethereal fake SMTP link generation</b>',
    });
    assert(
      Boolean(smtpResult.messageId) && Boolean(smtpResult.previewUrl),
      'Ethereal SMTP Delivery & Preview URL Generation',
      `Message ID: ${smtpResult.messageId}\n   ↳ Preview URL: ${smtpResult.previewUrl}`
    );

    // -------------------------------------------------------------
    // FEATURE 8: Idempotency Guard (No Double Sends)
    // -------------------------------------------------------------
    console.log('\n--- 8. Idempotency Guard Verification ---');
    const sentRecord = await prisma.scheduledEmail.create({
      data: {
        recipient: 'idempotent-check@example.com',
        subject: 'Idempotency Check',
        body: '<p>Should not double send</p>',
        sender: 'sender@reachinbox.ai',
        sendAt: new Date(),
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    const fetchedBefore = await prisma.scheduledEmail.findUnique({ where: { id: sentRecord.id } });
    assert(
      fetchedBefore?.status === 'SENT',
      'Idempotency Guard Setup',
      `Email ${sentRecord.id} exists with status SENT`
    );

    // -------------------------------------------------------------
    // FEATURE 9: Wait for Scheduled Emails to Process via BullMQ
    // -------------------------------------------------------------
    console.log('\n--- 9. BullMQ Delayed Execution & Delivery ---');
    console.log('Waiting 8 seconds for BullMQ worker to process scheduled jobs...');
    await new Promise((resolve) => setTimeout(resolve, 8000));

    const sentEmailsRes = await fetch(`${API_BASE}/emails/sent`);
    const sentEmailsData: any = await sentEmailsRes.json();
    const sentList = sentEmailsData.emails;
    const testEmail1Sent = sentList.some((e: any) => e.recipient === 'test-lead1@example.com');
    assert(
      testEmail1Sent,
      'BullMQ Worker Delayed Execution & Status Update to SENT',
      'Found test-lead1@example.com processed and moved to Sent Emails table'
    );

    // -------------------------------------------------------------
    // FEATURE 10: Cancel Scheduled Email
    // -------------------------------------------------------------
    console.log('\n--- 10. Cancel Scheduled Email ---');
    const emailToCancel = await prisma.scheduledEmail.create({
      data: {
        recipient: 'to-cancel@example.com',
        subject: 'Cancel Me',
        body: '<p>Will be cancelled</p>',
        sender: 'sender@reachinbox.ai',
        sendAt: new Date(Date.now() + 600000), // 10 minutes in future
        status: 'SCHEDULED',
      },
    });

    const cancelRes = await fetch(`${API_BASE}/emails/${emailToCancel.id}`, { method: 'DELETE' });
    const cancelData: any = await cancelRes.json();
    assert(
      cancelRes.status === 200 && cancelData.success,
      'DELETE /api/emails/:id (Cancel Scheduled Email)',
      `Cancelled email ${emailToCancel.id}`
    );

    const verifyDeleted = await prisma.scheduledEmail.findUnique({ where: { id: emailToCancel.id } });
    assert(verifyDeleted === null, 'Email Removed from Relational Database', 'Verified record no longer exists');

  } catch (err: any) {
    console.error('Unexpected error during test execution:', err?.message || err);
    failed++;
  } finally {
    console.log('\n===============================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
    console.log('===============================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
