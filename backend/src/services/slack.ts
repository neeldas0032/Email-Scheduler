import { query, queryOne } from '../db/pool';
import { redis } from '../db/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { windowLabel } from './rateLimiter';

export interface SlackIntegration {
  user_id: string;
  team_id: string | null;
  team_name: string | null;
  channel: string | null;
  webhook_url: string;
  connected_at: Date;
}

const SCOPES = 'incoming-webhook,chat:write';

export function installUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.slack.clientId,
    scope: SCOPES,
    redirect_uri: env.slack.redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.slack.clientId,
      client_secret: env.slack.clientSecret,
      code,
      redirect_uri: env.slack.redirectUri,
    }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    team?: { id: string; name: string };
    incoming_webhook?: { url: string; channel: string };
  };
  if (!data.ok || !data.incoming_webhook?.url) {
    throw new Error(`Slack OAuth failed: ${data.error ?? 'no incoming webhook returned'}`);
  }
  return data;
}

export async function saveIntegration(userId: string, data: Awaited<ReturnType<typeof exchangeCode>>) {
  await query(
    `INSERT INTO slack_integrations (user_id, team_id, team_name, channel, webhook_url, access_token, connected_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (user_id) DO UPDATE SET
       team_id = EXCLUDED.team_id,
       team_name = EXCLUDED.team_name,
       channel = EXCLUDED.channel,
       webhook_url = EXCLUDED.webhook_url,
       access_token = EXCLUDED.access_token,
       connected_at = now()`,
    [
      userId,
      data.team?.id ?? null,
      data.team?.name ?? null,
      data.incoming_webhook?.channel ?? null,
      data.incoming_webhook?.url,
      data.access_token ?? null,
    ]
  );
}

export async function getIntegration(userId: string): Promise<SlackIntegration | null> {
  return queryOne<SlackIntegration>(`SELECT * FROM slack_integrations WHERE user_id = $1`, [userId]);
}

export async function disconnect(userId: string): Promise<void> {
  await query(`DELETE FROM slack_integrations WHERE user_id = $1`, [userId]);
}

export async function postMessage(userId: string, text: string, blocks?: unknown[]): Promise<boolean> {
  const integration = await getIntegration(userId);
  // Not connected is a normal state, never an error.
  if (!integration) return false;
  try {
    const res = await fetch(integration.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(blocks ? { text, blocks } : { text }),
    });
    if (!res.ok) {
      logger.warn('slack', `webhook responded ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('slack', 'notification failed', String(err));
    return false;
  }
}

/**
 * Fired the moment a sender runs out of hourly budget. Deduped per
 * user+sender+hour so a 1000-email burst produces one Slack message, not 1000.
 */
export async function notifyRateLimitHit(params: {
  userId: string;
  senderEmail: string;
  senderId: string;
  scope: 'global' | 'sender';
  limit: number;
  retryAt: number;
  pendingCount?: number;
}): Promise<void> {
  const key = `slack:ratelimit:${params.userId}:${params.senderId}:${windowLabel()}`;
  const first = await redis.set(key, '1', 'EX', 3700, 'NX');
  if (first !== 'OK') return;

  const resumesAt = new Date(params.retryAt).toISOString().replace('T', ' ').slice(0, 16);
  const scopeText = params.scope === 'global' ? 'Global hourly limit' : 'Sender hourly limit';
  const text = `${scopeText} reached for ${params.senderEmail} (${params.limit}/hour). Queued emails resume at ${resumesAt} UTC.`;

  const sent = await postMessage(params.userId, text, [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Sending paused: hourly limit reached' },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Sender*\n${params.senderEmail}` },
        { type: 'mrkdwn', text: `*Limit*\n${params.limit} emails/hour` },
        { type: 'mrkdwn', text: `*Scope*\n${params.scope === 'global' ? 'Account-wide' : 'Per sender'}` },
        { type: 'mrkdwn', text: `*Resumes*\n${resumesAt} UTC` },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Nothing was dropped. Remaining emails were pushed to the next hour window in their original order.',
        },
      ],
    },
  ]);

  if (sent) logger.info('slack', `rate-limit notification sent for ${params.senderEmail}`);
}
