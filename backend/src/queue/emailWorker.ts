import { Worker, Job } from 'bullmq';
import { createBullMQRedisConnection } from '../redis/client';
import { redis } from '../redis/client';
import { prisma } from '../db/prisma';
import { config } from '../config';
import { emailQueue, enqueueRescheduledJob, EmailJobData } from './emailQueue';
import { sendEmail } from '../mailer/ethereal';
import { notifyRateLimit } from '../slack/notifier';
import { upsertEmailDoc } from '../elasticsearch/emailIndex';

// ─────────────────────────────────────────────────────────────────────────────
// Utility: get the current UTC hour window key for rate-limit Redis counters.
// Format: "YYYY-MM-DDTHH" (UTC) — changes every hour on the hour.
// ─────────────────────────────────────────────────────────────────────────────
function utcHourWindow(): string {
  const now = new Date();
  return now.toISOString().slice(0, 13); // e.g. "2024-01-15T09"
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: milliseconds until the next UTC hour boundary.
// Used to reschedule rate-limited jobs precisely to the next window.
// ─────────────────────────────────────────────────────────────────────────────
function msUntilNextUTCHour(): number {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  // Add 100ms buffer to ensure we're safely in the next window
  return nextHour.getTime() - now.getTime() + 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE PROCESSOR
// This function is called by BullMQ for every job dequeued from email-send-queue.
//
// GUARANTEE OVERVIEW:
// - Idempotency: Step 1 checks DB status before sending. If already 'sent',
//   returns immediately. Safe against crash-recovery double-execution.
// - Rate limiting: Step 2 uses Redis INCR (atomic) per sender per UTC hour.
//   If over limit → ack current job, enqueue new delayed job at next hour.
// - Min-delay enforcement: Step 3 uses the same delayed-reschedule pattern.
//   No busy-wait. No concurrency slot waste.
// - Restart safety: handled by startupReconciler.ts (separate concern).
// ─────────────────────────────────────────────────────────────────────────────
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { idempotencyKey, dbJobId, senderId, userId, recipientEmail, subject, body } = job.data;

  console.log(`[worker] Processing job ${job.id} | idempotencyKey: ${idempotencyKey}`);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 1 — IDEMPOTENCY CHECK
  //
  // WHY: BullMQ may re-execute a job after a worker crash — specifically if
  // the job was dequeued and processed but the worker died before BullMQ
  // received the "ack" (job.moveToCompleted). In that scenario, BullMQ will
  // retry the job on restart. We check the DB status here to prevent a
  // double-send in that case.
  //
  // Also catches the case where startupReconciler re-enqueued a job that was
  // already successfully sent (edge case: reconciler ran before DB updated).
  // ───────────────────────────────────────────────────────────────────────────
  const dbJob = await prisma.emailJob.findUnique({
    where: { idempotencyKey },
    include: { sender: true, user: true },
  });

  if (!dbJob) {
    console.warn(`[worker] No DB row found for idempotencyKey: ${idempotencyKey} — skipping`);
    return; // Ack job — nothing to send
  }

  if (dbJob.status === 'sent') {
    console.log(`[worker] Job ${idempotencyKey} already sent — acking without re-send`);
    return; // Ack job — idempotency guard
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 2 — PER-SENDER HOURLY RATE LIMIT (Redis INCR, atomic)
  //
  // Key: `ratelimit:{senderId}:{YYYY-MM-DDTHH}` (UTC hour window)
  // TTL: 7200s (2 hours) — generous to handle clock skew at hour boundaries.
  // INCR is atomic — no race condition between concurrent workers.
  //
  // If over limit:
  //   1. DECR to rollback (this job won't consume the slot)
  //   2. Compute delay to next UTC hour boundary
  //   3. Enqueue NEW delayed job (same idempotencyKey — Step 1 guards duplicates)
  //   4. Update DB status to 'rate_limited' + new bullJobId
  //   5. Notify Slack (non-throwing)
  //   6. Return (current job acked; new job will run at next hour)
  // ───────────────────────────────────────────────────────────────────────────
  const hourKey = `ratelimit:${senderId}:${utcHourWindow()}`;
  const currentCount = await redis.incr(hourKey);
  await redis.expire(hourKey, 7200);

  // Use per-job limit if provided, otherwise fall back to global config
  const effectiveHourlyLimit = job.data.maxEmailsPerHour ?? config.MAX_EMAILS_PER_HOUR_PER_SENDER;

  if (currentCount > effectiveHourlyLimit) {
    // Rollback — this send won't happen in this hour window
    await redis.decr(hourKey);

    const delayMs = msUntilNextUTCHour();
    console.log(
      `[worker] Rate limit hit for sender ${senderId} ` +
      `(${currentCount - 1}/${effectiveHourlyLimit}). ` +
      `Rescheduling in ${Math.round(delayMs / 1000)}s`
    );

    // Enqueue a NEW delayed BullMQ job — we do NOT call job.moveToDelayed()
    // because BullMQ v5 requires the internal lock token, which is fragile.
    // A new job with the same idempotencyKey data is cleaner and equally safe.
    const newBullJobId = await enqueueRescheduledJob(job.data, delayMs);

    // Update DB: status = rate_limited, track the new bullJobId
    await prisma.emailJob.update({
      where: { id: dbJobId },
      data: { status: 'rate_limited', bullJobId: newBullJobId, updatedAt: new Date() },
    });

    // Upsert ES document (non-blocking, non-throwing)
    upsertEmailDoc({ ...dbJob, status: 'rate_limited' }).catch((err) =>
      console.warn('[worker] ES upsert failed (rate_limited):', err.message)
    );

    // Notify Slack — silently no-ops if user has no Slack credentials
    notifyRateLimit(dbJob.user, dbJob.sender, config.MAX_EMAILS_PER_HOUR_PER_SENDER).catch(
      (err) => console.warn('[worker] Slack notify failed:', err.message)
    );

    return; // Current job is done (acked). New delayed job handles the send.
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 3 — PER-SENDER MIN-DELAY ENFORCEMENT (unified delayed-reschedule)
  //
  // Key: `lastsent:{senderId}` — stores Unix timestamp (ms) of last send.
  // If not enough time has passed since the last send for this sender:
  //   1. Rollback the hourly counter increment (this send won't happen now)
  //   2. Compute remaining wait time
  //   3. Enqueue NEW delayed job (same pattern as rate-limit reschedule)
  //   4. Return — current job acked, new job picks up after the delay
  //
  // WHY unified reschedule (not sleep):
  //   - Sleeping inside the worker wastes a concurrency slot for the full wait
  //   - Under high concurrency (5 workers × same sender), all would sleep/race
  //   - Delayed-reschedule releases the worker slot immediately
  // ───────────────────────────────────────────────────────────────────────────
  const lastSentKey = `lastsent:${senderId}`;
  const lastSentRaw = await redis.get(lastSentKey);
  const lastSentMs = lastSentRaw ? parseInt(lastSentRaw, 10) : 0;
  const msSinceLast = Date.now() - lastSentMs;

  if (msSinceLast < config.MIN_DELAY_MS_BETWEEN_SENDS) {
    // Rollback the hourly counter — this slot won't be used
    await redis.decr(hourKey);

    const remainingMs = config.MIN_DELAY_MS_BETWEEN_SENDS - msSinceLast + 50; // +50ms buffer
    console.log(
      `[worker] Min-delay not met for sender ${senderId} ` +
      `(${msSinceLast}ms since last, need ${config.MIN_DELAY_MS_BETWEEN_SENDS}ms). ` +
      `Rescheduling in ${remainingMs}ms`
    );

    const newBullJobId = await enqueueRescheduledJob(job.data, remainingMs);

    // Update bullJobId so reconciler is aware
    await prisma.emailJob.update({
      where: { id: dbJobId },
      data: { bullJobId: newBullJobId, updatedAt: new Date() },
    });

    return; // Current job acked. New delayed job handles the send.
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 4 — CLAIM THE SEND SLOT (before sending, to prevent concurrent races)
  //
  // Set lastSentAt BEFORE actually sending. This means:
  // - If two workers pass the min-delay check simultaneously for the same sender,
  //   the first to SET this key "wins" the slot; the second will see msSinceLast = ~0
  //   on its NEXT execution (it should have been rescheduled, but this is belt+suspenders).
  // - TTL = 2 * MIN_DELAY_MS to auto-expire if the send fails and worker crashes.
  // ───────────────────────────────────────────────────────────────────────────
  const claimTtlSeconds = Math.ceil((config.MIN_DELAY_MS_BETWEEN_SENDS * 2) / 1000);
  await redis.set(lastSentKey, String(Date.now()), 'EX', claimTtlSeconds);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 5 — SEND VIA ETHEREAL NODEMAILER
  // ───────────────────────────────────────────────────────────────────────────
  try {
    const { messageId, previewUrl } = await sendEmail({
      from: dbJob.sender.email,
      to: recipientEmail,
      subject,
      html: body,
      attachments: job.data.attachments,
    });

    console.log(`[worker] ✓ Sent ${messageId} to ${recipientEmail}`);
    console.log(`[worker]   Preview: ${previewUrl}`);

    // Update DB status to 'sent' with sentAt timestamp
    await prisma.emailJob.update({
      where: { id: dbJobId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        bullJobId: job.id,
        error: null,
        updatedAt: new Date(),
      },
    });

    // Upsert Elasticsearch document (non-blocking, graceful degradation)
    upsertEmailDoc({ ...dbJob, status: 'sent', sentAt: new Date() }).catch((err) =>
      console.warn('[worker] ES upsert failed (sent):', err.message)
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[worker] ✗ Send failed for ${recipientEmail}:`, errorMessage);

    // Update DB status to 'failed' with error message
    await prisma.emailJob.update({
      where: { id: dbJobId },
      data: {
        status: 'failed',
        error: errorMessage,
        updatedAt: new Date(),
      },
    });

    // Upsert ES document with failed status
    upsertEmailDoc({ ...dbJob, status: 'failed', error: errorMessage }).catch(() => {});

    // Throw so BullMQ can retry with exponential backoff (up to `attempts` times)
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker instance — processes jobs from email-send-queue
// WORKER_CONCURRENCY controls how many jobs are processed simultaneously.
// ─────────────────────────────────────────────────────────────────────────────
export function startEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    'email-send-queue',
    processEmailJob,
    {
      connection: createBullMQRedisConnection(),
      concurrency: config.WORKER_CONCURRENCY,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[worker] Worker error:', err.message);
  });

  console.log(`[worker] Started with concurrency=${config.WORKER_CONCURRENCY}`);
  return worker;
}
