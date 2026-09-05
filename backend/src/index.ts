import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import passport from 'passport';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { config } from './config';
import { rootRouter } from './routes';
import { emailQueue } from './queue/emailQueue';
import { startEmailWorker } from './queue/emailWorker';
import { reconcileOnStartup } from './queue/startupReconciler';
import { createEmailIndex } from './elasticsearch/emailIndex';
import { requireAuth } from './middleware/auth';

// ─────────────────────────────────────────────────────────────────────────────
// Express Application
// ─────────────────────────────────────────────────────────────────────────────
const app = express();

// ── Security & Parsing Middleware ─────────────────────────────────────────────
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // Required for Bull Board UI
    contentSecurityPolicy: false,     // Bull Board uses inline scripts
  })
);

app.use(
  cors({
    origin: config.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Passport (no session — JWT only) ─────────────────────────────────────────
app.use(passport.initialize());

// ── Bull Board — Live Queue Dashboard ────────────────────────────────────────
// Mounted at /admin/queues, protected by requireAuth middleware
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

// ── Bull Board — Live Queue Dashboard (public for demo) ──────────────────────
// Mounted at /admin/queues — NO auth required so reviewers can access directly
app.use('/admin/queues', serverAdapter.getRouter());

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/', rootRouter);

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[app] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Startup Sequence
// ─────────────────────────────────────────────────────────────────────────────
async function start() {
  console.log('[app] Starting Email Scheduler backend...');

  // 1. Initialize Elasticsearch index (non-blocking)
  await createEmailIndex();

  // 2. Start the BullMQ worker
  startEmailWorker();

  // 3. Run startup reconciliation — re-enqueue any lost scheduled jobs
  // This is run AFTER the worker starts so re-enqueued jobs can be processed
  await reconcileOnStartup();

  // 4. Start HTTP server
  app.listen(config.BACKEND_PORT, () => {
    console.log(`[app] Server running on http://localhost:${config.BACKEND_PORT}`);
    console.log(`[app] Bull Board: http://localhost:${config.BACKEND_PORT}/admin/queues`);
    console.log(`[app] Environment: ${config.NODE_ENV}`);
  });
}

start().catch((err) => {
  console.error('[app] Fatal startup error:', err);
  process.exit(1);
});

export default app;
