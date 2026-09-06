// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types for the Email Scheduler frontend
// ─────────────────────────────────────────────────────────────────────────────

export type EmailJobStatus = 'scheduled' | 'sent' | 'failed' | 'rate_limited';

export interface EmailJob {
  id: string;
  userId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string; // ISO string
  status: EmailJobStatus;
  bullJobId: string | null;
  idempotencyKey: string;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  sender?: {
    email: string;
  };
}

export interface Sender {
  id: string;
  userId: string;
  email: string;
  createdAt: string;
}

export interface User {
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface ScheduleRequest {
  subject: string;
  body: string;
  recipients: string[];
  senderId: string;
  startTime: string; // ISO string
  delayBetweenEmailsMs: number;
  maxEmailsPerHour: number;
  attachments?: {
    filename: string;
    content: string;
    contentType: string;
  }[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  jobs: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ScheduleResponse {
  scheduled: number;
  jobs: Array<{
    id: string;
    recipientEmail: string;
    scheduledAt: string;
    bullJobId: string;
  }>;
  errors?: Array<{ recipientEmail: string; error: string }>;
}

export interface SearchResponse {
  results: Array<{
    id: string;
    recipientEmail: string;
    subject: string;
    bodySnippet: string;
    status: EmailJobStatus;
    scheduledAt: string;
    sentAt: string | null;
  }>;
  degraded: boolean;
  message?: string;
}

export interface SendersResponse {
  senders: Sender[];
}

export interface SlackStatusResponse {
  connected: boolean;
  teamId: string | null;
}
