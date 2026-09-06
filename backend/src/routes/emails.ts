import { Router, Request, Response } from 'express';
import { createId } from '@paralleldrive/cuid2';
import { prisma } from '../db/prisma';
import { requireAuth, JwtPayload } from '../middleware/auth';
import { enqueueEmailJob } from '../queue/emailQueue';
import { upsertEmailDoc, searchEmails } from '../elasticsearch/emailIndex';
import { EmailJobData } from '../queue/emailQueue';
import { sendEmail } from '../mailer/ethereal';

export const emailsRouter = Router();

// All email routes require authentication
emailsRouter.use(requireAuth);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/emails/schedule
// Body: { subject, body, recipients: string[], senderId, startTime, delayBetweenEmailsMs, maxEmailsPerHour }
//
// Creates one EmailJob row per recipient, staggering scheduledAt by
// delayBetweenEmailsMs starting from startTime.
// Enqueues each as a BullMQ delayed job.
// ─────────────────────────────────────────────────────────────────────────────
emailsRouter.post('/schedule', async (req: Request, res: Response): Promise<void> => {
  const { subject, body, recipients, senderId, startTime, delayBetweenEmailsMs = 2000, maxEmailsPerHour, attachments } = req.body;
  const userId = (req.user as JwtPayload).userId;

  // Validation
  if (!subject || !body || !recipients?.length || !senderId || !startTime) {
    res.status(400).json({
      error: 'Missing required fields: subject, body, recipients, senderId, startTime',
    });
    return;
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    res.status(400).json({ error: 'recipients must be a non-empty array of email addresses' });
    return;
  }

  // Verify sender belongs to user
  const sender = await prisma.sender.findFirst({
    where: { id: senderId, userId },
  });

  if (!sender) {
    res.status(403).json({ error: 'Sender not found or does not belong to you' });
    return;
  }

  const start = new Date(startTime);
  if (isNaN(start.getTime())) {
    res.status(400).json({ error: 'Invalid startTime — must be a valid ISO date string' });
    return;
  }

  const createdJobs = [];
  const errors = [];

  for (let i = 0; i < recipients.length; i++) {
    const recipientEmail = recipients[i].trim().toLowerCase();
    const scheduledAt = new Date(start.getTime() + i * Number(delayBetweenEmailsMs));

    // Generate a stable idempotencyKey — never recomputed, even on reschedule
    const idempotencyKey = createId();

    try {
      // Step 1: Create DB row FIRST (idempotency anchor)
      const dbJob = await prisma.emailJob.create({
        data: {
          userId,
          senderId,
          recipientEmail,
          subject,
          body,
          attachments: attachments || null,
          scheduledAt,
          status: 'scheduled',
          idempotencyKey,
          // bullJobId is null until we successfully enqueue below
        },
      });

      // Step 2: Enqueue to BullMQ (delay = scheduledAt - now)
      const jobData: EmailJobData = {
        idempotencyKey,
        dbJobId: dbJob.id,
        userId,
        senderId,
        recipientEmail,
        subject,
        body,
        attachments,
        scheduledAt: scheduledAt.toISOString(),
      };

      const bullJobId = await enqueueEmailJob(jobData, scheduledAt);

      // Step 3: Update DB with bullJobId (so reconciler can verify on restart)
      await prisma.emailJob.update({
        where: { id: dbJob.id },
        data: { bullJobId },
      });

      // Step 4: Index in Elasticsearch (non-blocking, graceful)
      upsertEmailDoc({ ...dbJob, bullJobId }).catch(() => {});

      createdJobs.push({ id: dbJob.id, recipientEmail, scheduledAt, bullJobId });
    } catch (err) {
      const errorMsg = (err as Error).message;

      // Unique constraint violation = duplicate schedule request — skip silently
      if (errorMsg.includes('Unique constraint')) {
        console.log(`[api] Duplicate schedule skipped for ${recipientEmail} (idempotency)`);
        continue;
      }

      console.error(`[api] Failed to schedule for ${recipientEmail}:`, errorMsg);
      errors.push({ recipientEmail, error: errorMsg });
    }
  }

  res.status(201).json({
    scheduled: createdJobs.length,
    jobs: createdJobs,
    errors: errors.length > 0 ? errors : undefined,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/emails/send-now
// Sends emails immediately (synchronously) — bypasses BullMQ queue.
// Used when the user clicks "Send" without choosing a future time.
// ─────────────────────────────────────────────────────────────────────────────
emailsRouter.post('/send-now', async (req: Request, res: Response): Promise<void> => {
  const { subject, body, recipients, senderId, attachments } = req.body;
  const userId = (req.user as JwtPayload).userId;

  if (!subject || !body || !recipients?.length || !senderId) {
    res.status(400).json({ error: 'Missing required fields: subject, body, recipients, senderId' });
    return;
  }

  const sender = await prisma.sender.findFirst({ where: { id: senderId, userId } });
  if (!sender) {
    res.status(403).json({ error: 'Sender not found or does not belong to you' });
    return;
  }

  const sentJobs = [];

  // Create all DB rows first (status: sent) so the frontend shows them immediately
  for (const recipient of recipients) {
    const recipientEmail = recipient.trim().toLowerCase();
    const idempotencyKey = createId();
    const now = new Date();

    try {
      const dbJob = await prisma.emailJob.create({
        data: {
          userId,
          senderId,
          recipientEmail,
          subject,
          body,
          attachments: attachments || null,
          scheduledAt: now,
          sentAt: now,
          status: 'sent',
          idempotencyKey,
        },
      });
      sentJobs.push({ id: dbJob.id, recipientEmail, sentAt: now, dbJob });
    } catch (err) {
      console.error(`[api] send-now DB create failed for ${recipientEmail}:`, (err as Error).message);
    }
  }

  // Respond immediately so the UI never hangs
  res.status(200).json({
    scheduled: sentJobs.length,
    jobs: sentJobs.map(({ id, recipientEmail, sentAt }) => ({ id, recipientEmail, sentAt })),
  });

  // Fire SMTP delivery in the background (non-blocking)
  for (const { recipientEmail, dbJob } of sentJobs) {
    sendEmail({
      from: sender.email,
      to: recipientEmail,
      subject,
      html: body,
      attachments,
    }).then(({ messageId, previewUrl }) => {
      console.log(`[api] send-now ✓ Sent ${messageId} to ${recipientEmail}`);
      console.log(`[api] send-now   Preview: ${previewUrl}`);
      upsertEmailDoc({ ...dbJob, status: 'sent', sentAt: dbJob.sentAt! }).catch(() => {});
    }).catch((err: Error) => {
      console.error(`[api] send-now ✗ SMTP failed for ${recipientEmail}:`, err.message);
      // Mark as failed in DB
      prisma.emailJob.update({
        where: { id: dbJob.id },
        data: { status: 'failed', error: err.message, updatedAt: new Date() },
      }).catch(() => {});
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/emails/scheduled — Paginated list of scheduled emails
// ─────────────────────────────────────────────────────────────────────────────
emailsRouter.get('/scheduled', async (req: Request, res: Response): Promise<void> => {
  const userId = (req.user as JwtPayload).userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [jobs, total] = await Promise.all([
    prisma.emailJob.findMany({
      where: { userId, status: { in: ['scheduled', 'rate_limited'] } },
      orderBy: { scheduledAt: 'asc' },
      skip,
      take: limit,
      include: { sender: { select: { email: true } } },
    }),
    prisma.emailJob.count({
      where: { userId, status: { in: ['scheduled', 'rate_limited'] } },
    }),
  ]);

  res.json({
    jobs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/emails/sent — Paginated list of sent emails
// ─────────────────────────────────────────────────────────────────────────────
emailsRouter.get('/sent', async (req: Request, res: Response): Promise<void> => {
  const userId = (req.user as JwtPayload).userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [jobs, total] = await Promise.all([
    prisma.emailJob.findMany({
      where: { userId, status: { in: ['sent', 'failed'] } },
      orderBy: { sentAt: 'desc' },
      skip,
      take: limit,
      include: { sender: { select: { email: true } } },
    }),
    prisma.emailJob.count({
      where: { userId, status: { in: ['sent', 'failed'] } },
    }),
  ]);

  res.json({
    jobs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/emails/search?q= — Elasticsearch multi-match search
// Gracefully degrades if ES is down (returns degraded:true, empty results)
// ─────────────────────────────────────────────────────────────────────────────
emailsRouter.get('/search', async (req: Request, res: Response): Promise<void> => {
  const userId = (req.user as JwtPayload).userId;
  const query = (req.query.q as string)?.trim();

  if (!query || query.length < 2) {
    res.status(400).json({ error: 'Search query must be at least 2 characters' });
    return;
  }

  const result = await searchEmails(query, userId);
  res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/emails/:id — Single email job detail
// ─────────────────────────────────────────────────────────────────────────────
emailsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = (req.user as JwtPayload).userId;
  const { id } = req.params;

  const job = await prisma.emailJob.findFirst({
    where: { id, userId },
    include: { sender: { select: { email: true } } },
  });

  if (!job) {
    res.status(404).json({ error: 'Email job not found' });
    return;
  }

  res.json(job);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/senders — List senders for the authenticated user
// ─────────────────────────────────────────────────────────────────────────────
emailsRouter.get('/senders/list', async (req: Request, res: Response): Promise<void> => {
  const userId = (req.user as JwtPayload).userId;

  const senders = await prisma.sender.findMany({
    where: { userId },
    select: { id: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ senders });
});
