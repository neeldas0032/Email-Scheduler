import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { cancelEmail, emailStats, listEmails, scheduleCampaign } from '../services/emails';
import { listSenders } from '../services/senders';
import { usageSnapshot } from '../services/rateLimiter';
import { env } from '../config/env';
import { logger } from '../config/logger';

const router = Router();
router.use(requireAuth);

const scheduleSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(300),
  body: z.string().trim().min(1, 'Body is required').max(20_000),
  recipients: z.array(z.string().trim().email()).min(1, 'Add at least one recipient').max(20_000),
  startAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  delayMs: z.number().int().min(0).max(3_600_000).optional(),
  hourlyLimit: z.number().int().min(1).max(100_000).optional(),
});

router.post('/campaigns', async (req, res, next) => {
  try {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }

    const startAt = new Date(parsed.data.startAt);
    if (Number.isNaN(startAt.getTime())) {
      res.status(400).json({ error: 'Start time is not a valid date' });
      return;
    }

    const unique = Array.from(new Set(parsed.data.recipients.map((r) => r.toLowerCase())));
    const delayMs = Math.max(parsed.data.delayMs ?? env.queue.minDelayMs, env.queue.minDelayMs);

    const result = await scheduleCampaign({
      userId: req.user!.id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      recipients: unique,
      startAt: startAt.getTime() < Date.now() ? new Date() : startAt,
      delayMs,
      hourlyLimit: parsed.data.hourlyLimit ?? env.limits.perSenderPerHour,
    });

    res.status(201).json({
      ...result,
      skippedDuplicates: parsed.data.recipients.length - unique.length,
      delayMs,
    });
  } catch (err) {
    logger.error('emails', 'schedule failed', err);
    next(err);
  }
});

router.get('/emails', async (req, res, next) => {
  try {
    const tab = req.query.tab === 'sent' ? 'sent' : 'scheduled';
    const result = await listEmails({
      userId: req.user!.id,
      tab,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 100,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    const [stats, senders] = await Promise.all([emailStats(req.user!.id), listSenders(req.user!.id)]);
    const usage = await usageSnapshot(senders.map((s) => s.id));
    res.json({
      stats,
      senders: senders.map((s) => ({
        id: s.id,
        label: s.label,
        fromEmail: s.from_email,
        hourlyLimit: s.hourly_limit ?? env.limits.perSenderPerHour,
        usedThisHour: usage.senders[s.id] ?? 0,
      })),
      limits: {
        perSenderPerHour: env.limits.perSenderPerHour,
        globalPerHour: env.limits.globalPerHour,
        minDelayMs: env.queue.minDelayMs,
        concurrency: env.queue.concurrency,
      },
      usage: { globalThisHour: usage.global, windowEndsAt: usage.windowEndsAt },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/emails/:id/cancel', async (req, res, next) => {
  try {
    const row = await cancelEmail(req.user!.id, req.params.id);
    if (!row) {
      res.status(404).json({ error: 'That email is no longer cancellable' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
