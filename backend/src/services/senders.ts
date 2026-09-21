import { query, queryOne } from '../db/pool';
import { env } from '../config/env';
import { SenderRow } from '../types';
import { createEtherealAccount } from './mailer';
import { consumeSlot, ConsumeResult } from './rateLimiter';
import { logger } from '../config/logger';

export async function listSenders(userId: string): Promise<SenderRow[]> {
  return query<SenderRow>(
    `SELECT * FROM senders WHERE user_id = $1 AND is_active ORDER BY created_at ASC`,
    [userId]
  );
}

export async function getSender(senderId: string): Promise<SenderRow | null> {
  return queryOne<SenderRow>(`SELECT * FROM senders WHERE id = $1`, [senderId]);
}

export async function ensureSendersForUser(userId: string): Promise<SenderRow[]> {
  const existing = await listSenders(userId);
  if (existing.length > 0) return existing;

  const wanted = Math.max(1, env.ethereal.senderCount);
  const created: SenderRow[] = [];

  for (let i = 0; i < wanted; i++) {
    try {
      const creds = env.ethereal.autoProvision
        ? await createEtherealAccount()
        : {
            smtp_host: env.ethereal.host,
            smtp_port: env.ethereal.port,
            smtp_user: env.ethereal.user,
            smtp_pass: env.ethereal.pass,
            from_email: env.ethereal.user,
          };

      if (!creds.smtp_user || !creds.smtp_pass) {
        logger.warn('senders', 'no SMTP credentials available, skipping sender provisioning');
        break;
      }

      const row = await queryOne<SenderRow>(
        `INSERT INTO senders (user_id, label, from_email, smtp_host, smtp_port, smtp_user, smtp_pass, hourly_limit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [userId, `Sender ${i + 1}`, creds.from_email, creds.smtp_host, creds.smtp_port, creds.smtp_user, creds.smtp_pass, env.limits.perSenderPerHour]
      );
      if (row) created.push(row);
    } catch (err) {
      logger.error('senders', 'failed to provision Ethereal sender', err);
      break;
    }
  }

  logger.info('senders', `provisioned ${created.length} sender(s) for user ${userId}`);
  return created;
}

export function senderLimit(sender: SenderRow): number {
  return sender.hourly_limit ?? env.limits.perSenderPerHour;
}

export type PickResult =
  | { ok: true; sender: SenderRow }
  | { ok: false; reason: 'no_senders' }
  | { ok: false; reason: 'rate_limited'; retryAt: number; blockedBy: 'global' | 'sender'; sender: SenderRow };

export async function acquireSendSlot(userId: string, preferredSenderId: string | null): Promise<PickResult> {
  const senders = await listSenders(userId);
  if (senders.length === 0) return { ok: false, reason: 'no_senders' };

  const ordered = [...senders].sort((a, b) => {
    if (a.id === preferredSenderId) return -1;
    if (b.id === preferredSenderId) return 1;
    return 0;
  });

  let lastResult: ConsumeResult | null = null;
  let lastSender: SenderRow | null = null;

  for (const sender of ordered) {
    const result = await consumeSlot(sender.id, senderLimit(sender));
    if (result.allowed) return { ok: true, sender };
    lastResult = result;
    lastSender = sender;
    if (!result.allowed && result.reason === 'global') break;
  }

  const fallback = lastSender ?? ordered[0];
  const retryAt = lastResult && !lastResult.allowed ? lastResult.retryAt : Date.now() + 60_000;
  const blockedBy = lastResult && !lastResult.allowed ? lastResult.reason : 'sender';

  return {
    ok: false,
    reason: 'rate_limited',
    retryAt,
    blockedBy,
    sender: fallback,
  };
}
