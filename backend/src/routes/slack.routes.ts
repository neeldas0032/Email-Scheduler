import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { disconnect, exchangeCode, getIntegration, installUrl, postMessage, saveIntegration } from '../services/slack';
import { logger } from '../config/logger';
import jwt from 'jsonwebtoken';

const router = Router();

/** State carries the user id (signed) so the callback knows who is installing. */
router.get('/install', requireAuth, (req, res) => {
  if (!env.slack.configured) {
    res.status(500).json({ error: 'Slack OAuth is not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.' });
    return;
  }
  const state = jwt.sign({ uid: req.user!.id, n: crypto.randomBytes(8).toString('hex') }, env.jwtSecret, {
    expiresIn: '10m',
  });
  res.redirect(installUrl(state));
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) {
    res.redirect(`${env.frontendUrl}/dashboard?slack=error`);
    return;
  }
  try {
    const { uid } = jwt.verify(state, env.jwtSecret) as { uid: string };
    const data = await exchangeCode(code);
    await saveIntegration(uid, data);
    res.redirect(`${env.frontendUrl}/dashboard?slack=connected`);
  } catch (err) {
    logger.error('slack', 'oauth callback failed', err);
    res.redirect(`${env.frontendUrl}/dashboard?slack=error`);
  }
});

router.get('/status', requireAuth, async (req, res) => {
  const integration = await getIntegration(req.user!.id);
  res.json({
    connected: Boolean(integration),
    configured: env.slack.configured,
    teamName: integration?.team_name ?? null,
    channel: integration?.channel ?? null,
  });
});

router.post('/test', requireAuth, async (req, res) => {
  const ok = await postMessage(
    req.user!.id,
    'Test notification from your ReachInbox scheduler. Rate-limit alerts will arrive here.'
  );
  res.json({ ok });
});

router.post('/disconnect', requireAuth, async (req, res) => {
  await disconnect(req.user!.id);
  res.json({ ok: true });
});

export default router;
