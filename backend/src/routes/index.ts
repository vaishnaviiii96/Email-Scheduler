import { Router } from 'express';
import { authRouter } from './auth';
import { emailsRouter } from './emails';

export const rootRouter = Router();

rootRouter.use('/auth', authRouter);
rootRouter.use('/api/emails', emailsRouter);

// Health check — no auth required
rootRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
