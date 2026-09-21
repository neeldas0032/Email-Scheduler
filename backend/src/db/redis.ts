import IORedis, { RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';

// BullMQ requires maxRetriesPerRequest: null on the connections it owns.
export const bullConnection: RedisOptions = {
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  maxRetriesPerRequest: null,
};

// Separate client for our own commands (rate-limit counters, Slack dedupe).
export const redis = new IORedis(bullConnection);

// ioredis reconnects on its own; log instead of crashing the process.
redis.on('error', (err) => logger.warn('redis', 'connection error', err.message));
redis.on('connect', () => logger.info('redis', `connected to ${env.redis.host}:${env.redis.port}`));
