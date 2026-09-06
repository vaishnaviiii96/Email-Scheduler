import dotenv from 'dotenv';
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Typed configuration loader.
// All values read from environment — NEVER hardcoded.
// Throws at startup if any required variable is missing.
// ─────────────────────────────────────────────────────────────────────────────

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`[config] Missing required environment variable: ${key}`);
  }
  return val;
}

function optional(key: string, fallback = ''): string {
  return process.env[key] || fallback;
}

function optionalNumber(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) throw new Error(`[config] ${key} must be a number, got: ${val}`);
  return parsed;
}

export const config = {
  // Server
  NODE_ENV: optional('NODE_ENV', 'development'),
  BACKEND_PORT: optionalNumber('BACKEND_PORT', 4000),
  FRONTEND_URL: optional('FRONTEND_URL', 'http://localhost:3000'),
  BACKEND_URL: optional('BACKEND_URL', 'http://localhost:4000'),

  // Database
  DATABASE_URL: required('DATABASE_URL'),

  // Redis
  REDIS_URL: optional('REDIS_URL', 'redis://localhost:6379'),

  // Elasticsearch
  ELASTICSEARCH_URL: optional('ELASTICSEARCH_URL', 'http://localhost:9200'),

  // Google OAuth
  GOOGLE_CLIENT_ID: required('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: required('GOOGLE_CLIENT_SECRET'),

  // Slack OAuth
  SLACK_CLIENT_ID: optional('SLACK_CLIENT_ID'),
  SLACK_CLIENT_SECRET: optional('SLACK_CLIENT_SECRET'),

  // Resend HTTP email API (replaces Ethereal SMTP — works on Render)
  RESEND_API_KEY: optional('RESEND_API_KEY', ''),

  // Ethereal SMTP (legacy — kept for local dev fallback)
  ETHEREAL_USER: optional('ETHEREAL_USER'),
  ETHEREAL_PASS: optional('ETHEREAL_PASS'),

  // Auth JWT secret (shared with NextAuth frontend)
  NEXTAUTH_SECRET: required('NEXTAUTH_SECRET'),

  // Worker settings
  WORKER_CONCURRENCY: optionalNumber('WORKER_CONCURRENCY', 5),
  MIN_DELAY_MS_BETWEEN_SENDS: optionalNumber('MIN_DELAY_MS_BETWEEN_SENDS', 2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: optionalNumber('MAX_EMAILS_PER_HOUR_PER_SENDER', 200),
} as const;

export type Config = typeof config;
