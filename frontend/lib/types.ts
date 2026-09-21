export type EmailStatus =
  | 'scheduled'
  | 'rate_limited'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'cancelled';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface EmailRecord {
  id: string;
  to_email: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduled_at: string;
  sent_at: string | null;
  preview_url: string | null;
  error: string | null;
  attempts: number;
  sender_email?: string | null;
}

export interface EmailListResponse {
  rows: EmailRecord[];
  total: number;
  source: 'elasticsearch' | 'postgres';
}

export interface SenderSummary {
  id: string;
  label: string;
  fromEmail: string;
  hourlyLimit: number;
  usedThisHour: number;
}

export interface StatsResponse {
  stats: Record<EmailStatus, number>;
  senders: SenderSummary[];
  limits: {
    perSenderPerHour: number;
    globalPerHour: number;
    minDelayMs: number;
    concurrency: number;
  };
  usage: { globalThisHour: number; windowEndsAt: number };
}

export interface SlackStatus {
  connected: boolean;
  configured: boolean;
  teamName: string | null;
  channel: string | null;
}

export interface ScheduleResponse {
  campaignId: string;
  count: number;
  firstSendAt: string;
  skippedDuplicates: number;
  delayMs: number;
}
