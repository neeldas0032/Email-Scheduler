import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { queryOne } from '../db/pool';
import { UserRow } from '../types';
import { AUTH_COOKIE, cookieOptions, requireAuth, signSession } from '../middleware/auth';
import { ensureSendersForUser } from '../services/senders';
import { logger } from '../config/logger';

const router = Router();
const STATE_COOKIE = 'rb_oauth_state';

router.get('/google', (req, res) => {
  if (!env.google.configured) {
    res.status(500).json({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/' });

  const params = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: env.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  const expected = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: '/' });

  if (!code || !state || state !== expected) {
    res.redirect(`${env.frontendUrl}/?error=oauth_state`);
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        redirect_uri: env.google.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokens.access_token) throw new Error(tokens.error ?? 'token exchange failed');

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = (await profileRes.json()) as {
      id: string;
      email: string;
      name?: string;
      picture?: string;
    };

    const user = await queryOne<UserRow>(
      `INSERT INTO users (google_id, email, name, avatar_url)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (google_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
       RETURNING *`,
      [profile.id, profile.email, profile.name ?? profile.email, profile.picture ?? null]
    );
    if (!user) throw new Error('could not persist user');

    // Give every new account working Ethereal senders, without blocking login.
    void ensureSendersForUser(user.id);

    const token = signSession({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
    });
    res.cookie(AUTH_COOKIE, token, cookieOptions());
    res.redirect(`${env.frontendUrl}/dashboard`);
  } catch (err) {
    logger.error('auth', 'google callback failed', err);
    res.redirect(`${env.frontendUrl}/?error=oauth_failed`);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  res.json({ ok: true });
});

export default router;
