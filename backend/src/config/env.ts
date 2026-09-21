import 'dotenv/config';

const str = (name: string, fallback = ''): string => process.env[name] ?? fallback;
const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
};

const apiUrl = str('API_URL', 'http://localhost:4000');

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  isProd: str('NODE_ENV', 'development') === 'production',
  port: num('PORT', 4000),
  apiUrl,
  frontendUrl: str('FRONTEND_URL', 'http://localhost:3000'),
  jwtSecret: str('JWT_SECRET', 'dev-secret-change-me'),
  databaseUrl: str('DATABASE_URL', 'postgres://reachinbox:reachinbox@localhost:5432/reachinbox'),

  redis: {
    host: str('REDIS_HOST', '127.0.0.1'),
    port: num('REDIS_PORT', 6379),
    password: str('REDIS_PASSWORD') || undefined,
  },

  queue: {
    name: str('QUEUE_NAME', 'email-send'),
    concurrency: num('WORKER_CONCURRENCY', 5),
    minDelayMs: num('MIN_DELAY_BETWEEN_EMAILS_MS', 2000),
    attempts: num('JOB_ATTEMPTS', 3),
    backoffMs: num('JOB_BACKOFF_MS', 5000),
    startWorkerInline: bool('START_WORKER_INLINE', true),
  },

  limits: {
    perSenderPerHour: num('MAX_EMAILS_PER_HOUR_PER_SENDER', 100),
    globalPerHour: num('MAX_EMAILS_PER_HOUR', 500),
  },

  google: {
    clientId: str('GOOGLE_CLIENT_ID'),
    clientSecret: str('GOOGLE_CLIENT_SECRET'),
    redirectUri: str('GOOGLE_REDIRECT_URI', `${apiUrl}/auth/google/callback`),
    configured: Boolean(str('GOOGLE_CLIENT_ID') && str('GOOGLE_CLIENT_SECRET')),
  },

  slack: {
    clientId: str('SLACK_CLIENT_ID'),
    clientSecret: str('SLACK_CLIENT_SECRET'),
    redirectUri: str('SLACK_REDIRECT_URI', `${apiUrl}/api/slack/callback`),
    configured: Boolean(str('SLACK_CLIENT_ID') && str('SLACK_CLIENT_SECRET')),
  },

  elastic: {
    enabled: bool('ELASTICSEARCH_ENABLED', true),
    node: str('ELASTICSEARCH_NODE', 'http://localhost:9200'),
    index: str('ELASTICSEARCH_INDEX', 'emails'),
  },

  ethereal: {
    autoProvision: bool('AUTO_PROVISION_ETHEREAL_SENDERS', true),
    senderCount: num('ETHEREAL_SENDER_COUNT', 2),
    host: str('ETHEREAL_HOST', 'smtp.ethereal.email'),
    port: num('ETHEREAL_PORT', 587),
    user: str('ETHEREAL_USER'),
    pass: str('ETHEREAL_PASS'),
  },
};

export const HOUR_MS = 60 * 60 * 1000;
