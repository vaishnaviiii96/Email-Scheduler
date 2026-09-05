import { Client } from '@elastic/elasticsearch';
import { config } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// Elasticsearch client singleton
//
// GRACEFUL DEGRADATION DESIGN:
// If Elasticsearch is unavailable (not started, OOM killed, etc.):
//   - The client constructor won't throw — errors happen on individual requests
//   - All functions that use this client catch errors and return null/empty
//   - Schedule and send endpoints are NOT affected by ES state
//   - Search endpoint returns { results: [], degraded: true } on ES failure
// ─────────────────────────────────────────────────────────────────────────────
export const esClient = new Client({
  node: config.ELASTICSEARCH_URL,
  requestTimeout: 5000,   // 5s timeout — don't block on slow ES
  pingTimeout: 3000,
  maxRetries: 1,          // Only 1 retry — fail fast for graceful degradation
});

// ─────────────────────────────────────────────────────────────────────────────
// isEsAvailable — Quick health check used by search endpoint
// Returns false on any error (connection refused, timeout, etc.)
// ─────────────────────────────────────────────────────────────────────────────
export async function isEsAvailable(): Promise<boolean> {
  try {
    await esClient.ping();
    return true;
  } catch {
    return false;
  }
}
