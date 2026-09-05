import Redis from 'ioredis';
import { config } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// Singleton ioredis client.
// BullMQ requires its own separate connection instances (see emailQueue.ts).
// This client is used for: rate-limit counters, lastSentAt tracking, etc.
// ─────────────────────────────────────────────────────────────────────────────

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ connection pattern
  enableReadyCheck: false,
  lazyConnect: false,
});

redis.on('error', (err) => {
  console.error('[redis] Connection error:', err.message);
});

redis.on('connect', () => {
  console.log('[redis] Connected to Redis');
});

// ─────────────────────────────────────────────────────────────────────────────
// Separate connection for BullMQ (BullMQ manages its own connection lifecycle)
// ─────────────────────────────────────────────────────────────────────────────
export function createBullMQRedisConnection() {
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
