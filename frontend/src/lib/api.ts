import { getSession } from 'next-auth/react';
import type {
  PaginatedResponse,
  EmailJob,
  ScheduleRequest,
  ScheduleResponse,
  SearchResponse,
  SendersResponse,
  SlackStatusResponse,
} from '@/types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

// ─────────────────────────────────────────────────────────────────────────────
// Base fetch wrapper — auto-attaches Authorization: Bearer header
// ─────────────────────────────────────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const session = await getSession();
    const token = session?.accessToken;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      return { data: null, error: errBody.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API methods
// ─────────────────────────────────────────────────────────────────────────────
export const api = {
  // Email scheduling (future time)
  scheduleEmails: (body: ScheduleRequest) =>
    apiFetch<ScheduleResponse>('/api/emails/schedule', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Immediate send (bypasses queue, shows in Sent instantly)
  sendNow: (body: { subject: string; body: string; recipients: string[]; senderId: string; attachments?: ScheduleRequest['attachments'] }) =>
    apiFetch<ScheduleResponse>('/api/emails/send-now', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Scheduled emails list
  getScheduled: (page = 1, limit = 20) =>
    apiFetch<PaginatedResponse<EmailJob>>(`/api/emails/scheduled?page=${page}&limit=${limit}`),

  // Sent emails list
  getSent: (page = 1, limit = 20) =>
    apiFetch<PaginatedResponse<EmailJob>>(`/api/emails/sent?page=${page}&limit=${limit}`),

  // Elasticsearch search
  searchEmails: (q: string) =>
    apiFetch<SearchResponse>(`/api/emails/search?q=${encodeURIComponent(q)}`),

  // Single email detail
  getEmail: (id: string) => apiFetch<EmailJob>(`/api/emails/${id}`),

  // Senders list
  getSenders: () => apiFetch<SendersResponse>('/api/emails/senders/list'),

  // Slack connection status
  getSlackStatus: () => apiFetch<SlackStatusResponse>('/auth/slack/status'),

  // Disconnect Slack
  disconnectSlack: () => apiFetch<{ disconnected: boolean }>('/auth/slack/disconnect', { method: 'DELETE' }),
};
