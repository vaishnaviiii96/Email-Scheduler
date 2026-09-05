import { prisma } from '../db/prisma';
import { emailQueue, enqueueRescheduledJob, EmailJobData } from './emailQueue';
import { enqueueEmailJob } from './emailQueue';

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP RECONCILER — Restart-Safety Guarantee
//
// PURPOSE: Ensure no scheduled emails are "lost" after a backend restart.
//
// WHEN THIS MATTERS:
// Scenario A — Normal restart (Redis intact with AOF):
//   BullMQ delayed jobs persist in Redis. queue.getJob(bullJobId) returns the job.
//   → Reconciler skips these (no action needed).
//
// Scenario B — Redis crashed WITHOUT AOF (or Redis data lost):
//   DB rows have bullJobId, but queue.getJob(bullJobId) returns null.
//   → Reconciler re-enqueues with delay = max(0, scheduledAt - now).
//
// Scenario C — Server crashed BETWEEN prisma.emailJob.create() and emailQueue.add():
//   DB row was created with bullJobId = null.
//   → Reconciler always re-enqueues these (bullJobId null = never reached queue).
//
// DUPLICATE PREVENTION:
//   All re-enqueued jobs carry the SAME idempotencyKey as the original DB row.
//   The worker's Step 1 (idempotency check) will ack without sending if status = 'sent'.
//   Additionally, the DB unique constraint on idempotencyKey prevents duplicate rows.
//
// GUARD: This runs ONCE on startup. Even if the server crashes mid-reconciliation
//   and restarts again, re-enqueuing the same job twice is safe because:
//   - enqueueEmailJob uses jobId = `email-${idempotencyKey}` — BullMQ deduplicates
//     by jobId if the job is still in the queue (waiting/delayed state).
//   - Worker's idempotency check handles any edge case that slips through.
// ─────────────────────────────────────────────────────────────────────────────
export async function reconcileOnStartup(): Promise<void> {
  console.log('[reconciler] Starting startup reconciliation...');

  const pendingJobs = await prisma.emailJob.findMany({
    where: {
      status: { in: ['scheduled', 'rate_limited'] },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  if (pendingJobs.length === 0) {
    console.log('[reconciler] No pending jobs to reconcile');
    return;
  }

  console.log(`[reconciler] Found ${pendingJobs.length} pending job(s) to check`);

  let requeued = 0;
  let skipped = 0;

  for (const job of pendingJobs) {
    try {
      let needsRequeue = false;

      if (job.bullJobId) {
        // Scenario A or B: check if BullMQ still has this job
        const bullJob = await emailQueue.getJob(job.bullJobId);
        if (bullJob === null) {
          // Scenario B: bullJobId in DB but not in Redis → re-enqueue
          needsRequeue = true;
          console.log(
            `[reconciler] Job ${job.id} (${job.idempotencyKey}): ` +
            `bullJobId ${job.bullJobId} not found in Redis → re-enqueuing`
          );
        } else {
          // Scenario A: job exists in Redis, BullMQ will handle it
          skipped++;
          continue;
        }
      } else {
        // Scenario C: bullJobId is null — never made it to the queue
        needsRequeue = true;
        console.log(
          `[reconciler] Job ${job.id} (${job.idempotencyKey}): ` +
          `bullJobId is null → re-enqueuing`
        );
      }

      if (needsRequeue) {
        const delay = Math.max(0, job.scheduledAt.getTime() - Date.now());

        const jobData: EmailJobData = {
          idempotencyKey: job.idempotencyKey, // SAME key — idempotency guard in worker
          dbJobId: job.id,
          userId: job.userId,
          senderId: job.senderId,
          recipientEmail: job.recipientEmail,
          subject: job.subject,
          body: job.body,
          scheduledAt: job.scheduledAt.toISOString(),
        };

        const newBullJobId = await enqueueEmailJob(jobData, job.scheduledAt);

        // Update bullJobId in DB so next reconciler run recognizes this job
        await prisma.emailJob.update({
          where: { id: job.id },
          data: { bullJobId: newBullJobId, updatedAt: new Date() },
        });

        requeued++;
      }
    } catch (err) {
      // Don't let one failed reconciliation block the rest
      console.error(`[reconciler] Error processing job ${job.id}:`, err);
    }
  }

  console.log(
    `[reconciler] Complete — re-queued: ${requeued}, already-in-redis: ${skipped}, total: ${pendingJobs.length}`
  );
}
