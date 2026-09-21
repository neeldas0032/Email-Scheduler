export type EmailStatus =
  | 'scheduled'
  | 'rate_limited'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'cancelled';

export interface UserRow {
  id: string;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: Date;
}

export interface SenderRow {
  id: string;
  user_id: string;
  label: string;
  from_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  hourly_limit: number | null;
  is_active: boolean;
}

export interface EmailRow {
  id: string;
  campaign_id: string;
  user_id: string;
  sender_id: string | null;
  position: number;
  to_email: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduled_at: Date;
  sent_at: Date | null;
  message_id: string | null;
  preview_url: string | null;
  error: string | null;
  attempts: number;
  created_at: Date;
}

export interface EmailJobData {
  emailId: string;
  userId: string;
  campaignId: string;
  position: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}
