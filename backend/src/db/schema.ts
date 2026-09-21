import { pool } from './pool';
import { logger } from '../config/logger';

// Idempotent schema. Runs on every boot, safe to re-run.
const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id  TEXT UNIQUE NOT NULL,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS senders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  from_email   TEXT NOT NULL,
  smtp_host    TEXT NOT NULL,
  smtp_port    INTEGER NOT NULL,
  smtp_user    TEXT NOT NULL,
  smtp_pass    TEXT NOT NULL,
  hourly_limit INTEGER,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_senders_user ON senders(user_id);

CREATE TABLE IF NOT EXISTS campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject          TEXT NOT NULL,
  body             TEXT NOT NULL,
  start_at         TIMESTAMPTZ NOT NULL,
  delay_ms         INTEGER NOT NULL,
  hourly_limit     INTEGER NOT NULL,
  total_recipients INTEGER NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emails (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id    UUID REFERENCES senders(id) ON DELETE SET NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  to_email     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at      TIMESTAMPTZ,
  message_id   TEXT,
  preview_url  TEXT,
  error        TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT emails_status_check
    CHECK (status IN ('scheduled','rate_limited','processing','sent','failed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_emails_user_status ON emails(user_id, status, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_pending ON emails(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_emails_campaign ON emails(campaign_id);

CREATE TABLE IF NOT EXISTS slack_integrations (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_id      TEXT,
  team_name    TEXT,
  channel      TEXT,
  webhook_url  TEXT NOT NULL,
  access_token TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function initSchema(): Promise<void> {
  await pool.query(SCHEMA);
  logger.info('db', 'schema ready');
}
