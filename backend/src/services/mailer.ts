import nodemailer, { Transporter } from 'nodemailer';
import { SenderRow } from '../types';
import { logger } from '../config/logger';

const transporters = new Map<string, Transporter>();

function transporterFor(sender: SenderRow): Transporter {
  const cached = transporters.get(sender.id);
  if (cached) return cached;

  const transporter = nodemailer.createTransport({
    host: sender.smtp_host,
    port: sender.smtp_port,
    secure: sender.smtp_port === 465,
    auth: { user: sender.smtp_user, pass: sender.smtp_pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  });

  transporters.set(sender.id, transporter);
  return transporter;
}

export interface SendResult {
  messageId: string;
  previewUrl: string | null;
}

export async function sendEmail(params: {
  sender: SenderRow;
  to: string;
  subject: string;
  body: string;
}): Promise<SendResult> {
  const { sender, to, subject, body } = params;
  const info = await transporterFor(sender).sendMail({
    from: `"${sender.label}" <${sender.from_email}>`,
    to,
    subject,
    text: body,
    html: `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">${body
      .split('\n')
      .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
      .join('')}</div>`,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  logger.info('mailer', `sent to ${to} via ${sender.from_email}`, { previewUrl });
  return { messageId: info.messageId, previewUrl: previewUrl ? String(previewUrl) : null };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Creates a throwaway Ethereal inbox and returns SMTP credentials for it. */
export async function createEtherealAccount() {
  const account = await nodemailer.createTestAccount();
  return {
    smtp_host: account.smtp.host,
    smtp_port: account.smtp.port,
    smtp_user: account.user,
    smtp_pass: account.pass,
    from_email: account.user,
  };
}
