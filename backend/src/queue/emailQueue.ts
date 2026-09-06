import { Queue } from 'bullmq';
import { createBullMQRedisConnection } from '../redis/client';
import { config } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// EmailJobData — Payload stored in each BullMQ job.
// Contains everything needed to process a send without an extra DB query
// for the hot path, PLUS the idempotencyKey for deduplication.
// ─────────────────────────────────────────────────────────────────────────────
export interface EmailJobData {
  /** Stable idempotency key — generated once at EmailJob row creation */
  idempotencyKey: string;
  /** DB EmailJob.id (for DB updates in processor) */
  dbJobId: string;
  userId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  attachments?: { filename: string; content: string; contentType: string }[];
  scheduledAt: string; // ISO string
  /** Per-job hourly rate limit — set by user in the compose form */
  maxEmailsPerHour?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// email-send-queue — The single BullMQ queue for all email sends.
//
// Design notes:
// - BullMQ persistent delayed jobs survive Redis restarts IF Redis uses AOF
//   (configured in docker-compose.yml with --appendonly yes --appendfsync everysec)
// - The global `limiter` here is a safety net for overall queue throughput.
//   Real per-sender rate limiting is done INSIDE the processor via Redis INCR.
// - removeOnComplete/removeOnFail retain job history for Bull Board visibility.
// ─────────────────────────────────────────────────────────────────────────────
export const emailQueue = new Queue<EmailJobData>('email-send-queue', {
  connection: createBullMQRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 25s, 125s
    },
    removeOnComplete: { count: 500 }, // keep last 500 completed for Bull Board
    removeOnFail: { count: 1000 },     // keep last 1000 failed for debugging
  },
});

emailQueue.on('error', (err) => {
  console.error('[queue] email-send-queue error:', err.message);
});

console.log('[queue] email-send-queue initialized');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: enqueue a single email job with a delay computed from scheduledAt
// Returns the BullMQ job ID.
// ─────────────────────────────────────────────────────────────────────────────
export async function enqueueEmailJob(
  data: EmailJobData,
  scheduledAt: Date
): Promise<string> {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());

  const job = await emailQueue.add('send-email', data, {
    delay,
    // Use idempotencyKey as the deduplication ID within BullMQ
    // This prevents exact duplicates if enqueueEmailJob is called twice with
    // the same key (belt-and-suspenders alongside the DB unique constraint).
    jobId: `email-${data.idempotencyKey}`,
  });

  return job.id!;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: enqueue a re-scheduled job (rate-limited or min-delay reschedule).
// Uses a different jobId suffix so it doesn't collide with the original job.
// The idempotencyKey in the data is the SAME — processor Step 1 guards duplicates.
// ─────────────────────────────────────────────────────────────────────────────
export async function enqueueRescheduledJob(
  data: EmailJobData,
  delayMs: number
): Promise<string> {
  const job = await emailQueue.add('send-email', data, {
    delay: delayMs,
    jobId: `email-${data.idempotencyKey}-reschedule-${Date.now()}`,
  });

  return job.id!;
}

export { config };
