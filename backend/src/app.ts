import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { env } from './config/env';
import { logger } from './config/logger';
import { attachUser } from './middleware/auth';
import { emailQueue } from './queue/emailQueue';
import authRoutes from './routes/auth.routes';
import emailRoutes from './routes/emails.routes';
import slackRoutes from './routes/slack.routes';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.frontendUrl, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'reachinbox-scheduler' }));

  // Live BullMQ dashboard: waiting / delayed / active / completed / failed.
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter });
  app.use('/admin/queues', serverAdapter.getRouter());

  app.use('/auth', authRoutes);
  app.use('/api/slack', slackRoutes);
  app.use('/api', emailRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('http', err.message, err.stack);
    res.status(err.status ?? 500).json({ error: err.message || 'Something went wrong' });
  });

  return app;
}
