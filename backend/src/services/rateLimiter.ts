import { redis } from '../db/redis';
import { env, HOUR_MS } from '../config/env';

/**
 * Hourly rate limiting with Redis counters.
 *
 * Why Redis and not in-memory: counters must be correct across N workers and N
 * API instances. Why a Lua script: the global check, the per-sender check and
 * the rollback on rejection must be atomic, otherwise two workers can both
 * observe "1 slot left" and both take it.
 *
 * Returns: 0 = allowed, 1 = blocked by the global limit, 2 = blocked by the
 * sender limit. On rejection every counter this call touched is rolled back.
 */
const CONSUME_LUA = `
local globalKey = KEYS[1]
local senderKey = KEYS[2]
local globalLimit = tonumber(ARGV[1])
local senderLimit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local g = redis.call('INCR', globalKey)
if g == 1 then redis.call('EXPIRE', globalKey, ttl) end
if g > globalLimit then
  redis.call('DECR', globalKey)
  return 1
end

local s = redis.call('INCR', senderKey)
if s == 1 then redis.call('EXPIRE', senderKey, ttl) end
if s > senderLimit then
  redis.call('DECR', senderKey)
  redis.call('DECR', globalKey)
  return 2
end

return 0
`;

export type ConsumeResult =
  | { allowed: true }
  | { allowed: false; reason: 'global' | 'sender'; retryAt: number };

export function windowStart(ts: number = Date.now()): number {
  return Math.floor(ts / HOUR_MS) * HOUR_MS;
}

export function nextWindowStart(ts: number = Date.now()): number {
  return windowStart(ts) + HOUR_MS;
}

export function windowLabel(ts: number = Date.now()): string {
  return new Date(windowStart(ts)).toISOString().slice(0, 13).replace(/[-T:]/g, '');
}

const globalKey = (ts: number) => `rl:global:${windowLabel(ts)}`;
const senderKey = (senderId: string, ts: number) => `rl:sender:${senderId}:${windowLabel(ts)}`;

/** Atomically take one slot for this sender in the current hour window. */
export async function consumeSlot(senderId: string, senderLimit: number): Promise<ConsumeResult> {
  const now = Date.now();
  const ttl = Math.ceil((nextWindowStart(now) - now) / 1000) + 60;

  const code = (await redis.eval(
    CONSUME_LUA,
    2,
    globalKey(now),
    senderKey(senderId, now),
    String(env.limits.globalPerHour),
    String(senderLimit),
    String(ttl)
  )) as number;

  if (code === 0) return { allowed: true };
  return {
    allowed: false,
    reason: code === 1 ? 'global' : 'sender',
    retryAt: nextWindowStart(now),
  };
}

/** Release a slot if the send failed before it actually left the building. */
export async function releaseSlot(senderId: string): Promise<void> {
  const now = Date.now();
  await redis
    .multi()
    .decr(globalKey(now))
    .decr(senderKey(senderId, now))
    .exec()
    .catch(() => undefined);
}

export async function usageSnapshot(senderIds: string[]) {
  if (senderIds.length === 0) return { global: 0, senders: {} as Record<string, number> };
  const now = Date.now();
  const pipeline = redis.pipeline();
  pipeline.get(globalKey(now));
  senderIds.forEach((id) => pipeline.get(senderKey(id, now)));
  const res = await pipeline.exec();
  const values = (res ?? []).map(([, v]) => Number(v ?? 0));
  const senders: Record<string, number> = {};
  senderIds.forEach((id, i) => {
    senders[id] = values[i + 1] ?? 0;
  });
  return { global: values[0] ?? 0, senders, windowEndsAt: nextWindowStart(now) };
}

/**
 * Where a rate-limited job should land. We push it into the next hour window
 * and keep the campaign's original ordering by offsetting each email by its
 * position, so email #1 is still attempted before email #500.
 */
export function rescheduleTimestamp(position: number, senderLimit: number): number {
  const base = nextWindowStart();
  const spacing = Math.max(env.queue.minDelayMs, Math.floor(HOUR_MS / Math.max(senderLimit, 1)));
  const offset = (position % Math.max(senderLimit, 1)) * spacing;
  return base + Math.min(offset, HOUR_MS - 1000);
}
