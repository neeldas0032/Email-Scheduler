import type {
  EmailListResponse,
  ScheduleResponse,
  SlackStatus,
  StatsResponse,
  User,
} from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new ApiError('Cannot reach the API. Is the backend running on ' + API_URL + '?', 0);
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: User }>('/auth/me'),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  listEmails: (tab: 'scheduled' | 'sent', q?: string) =>
    request<EmailListResponse>(`/api/emails?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}`),

  stats: () => request<StatsResponse>('/api/stats'),

  schedule: (payload: {
    subject: string;
    body: string;
    recipients: string[];
    startAt: string;
    delayMs: number;
    hourlyLimit: number;
  }) => request<ScheduleResponse>('/api/campaigns', { method: 'POST', body: JSON.stringify(payload) }),

  cancel: (id: string) => request<{ ok: boolean }>(`/api/emails/${id}/cancel`, { method: 'POST' }),

  slackStatus: () => request<SlackStatus>('/api/slack/status'),
  slackTest: () => request<{ ok: boolean }>('/api/slack/test', { method: 'POST' }),
  slackDisconnect: () => request<{ ok: boolean }>('/api/slack/disconnect', { method: 'POST' }),
};

export const googleLoginUrl = `${API_URL}/auth/google`;
export const slackInstallUrl = `${API_URL}/api/slack/install`;
export const queueDashboardUrl = `${API_URL}/admin/queues`;
