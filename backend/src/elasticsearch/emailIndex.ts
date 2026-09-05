import { esClient, isEsAvailable } from './client';
import { EmailJob } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Elasticsearch index name
// ─────────────────────────────────────────────────────────────────────────────
const INDEX = 'emails';

// ─────────────────────────────────────────────────────────────────────────────
// Email document shape stored in Elasticsearch
// ─────────────────────────────────────────────────────────────────────────────
export interface EmailDocument {
  id: string;
  userId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  bodySnippet: string; // first 500 chars — avoid huge ES docs
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// createEmailIndex — Create the 'emails' index with field mappings if absent.
// Called once on server startup. Safe to call multiple times (uses ignore 400).
// ─────────────────────────────────────────────────────────────────────────────
export async function createEmailIndex(): Promise<void> {
  try {
    const available = await isEsAvailable();
    if (!available) {
      console.warn('[es] Elasticsearch unavailable — skipping index creation');
      return;
    }

    const exists = await esClient.indices.exists({ index: INDEX });
    if (exists) {
      console.log(`[es] Index '${INDEX}' already exists`);
      return;
    }

    await esClient.indices.create({
      index: INDEX,
      mappings: {
        properties: {
          id: { type: 'keyword' },
          userId: { type: 'keyword' },
          senderId: { type: 'keyword' },
          recipientEmail: { type: 'keyword' },
          subject: { type: 'text', analyzer: 'standard' },
          bodySnippet: { type: 'text', analyzer: 'standard' },
          status: { type: 'keyword' },
          scheduledAt: { type: 'date' },
          sentAt: { type: 'date' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
        },
      },
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0, // single-node dev setup
      },
    });

    console.log(`[es] Created index '${INDEX}'`);
  } catch (err) {
    // Non-fatal — ES indexing is a nice-to-have, not blocking
    console.warn('[es] createEmailIndex error:', (err as Error).message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// upsertEmailDoc — Index or update an email document.
// Called after every EmailJob create/update in the DB.
// Non-throwing — all errors are logged and swallowed.
// ─────────────────────────────────────────────────────────────────────────────
export async function upsertEmailDoc(job: Partial<EmailJob> & { id: string }): Promise<void> {
  try {
    const doc: Partial<EmailDocument> = {
      id: job.id,
      userId: job.userId,
      senderId: job.senderId,
      recipientEmail: job.recipientEmail,
      subject: job.subject,
      bodySnippet: job.body?.slice(0, 500),
      status: job.status,
      scheduledAt: job.scheduledAt?.toISOString(),
      sentAt: job.sentAt?.toISOString() ?? null,
      createdAt: job.createdAt?.toISOString(),
      updatedAt: job.updatedAt?.toISOString() ?? new Date().toISOString(),
    };

    await esClient.update({
      index: INDEX,
      id: job.id,
      doc,
      doc_as_upsert: true,
    });
  } catch (err) {
    // Swallow — ES unavailability must not break the email pipeline
    console.warn('[es] upsertEmailDoc error:', (err as Error).message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// searchEmails — Multi-match search on subject, bodySnippet, recipientEmail
// Returns { results, degraded } — degraded=true means ES was unavailable
// ─────────────────────────────────────────────────────────────────────────────
export interface SearchResult {
  results: EmailDocument[];
  degraded: boolean;
  message?: string;
}

export async function searchEmails(
  query: string,
  userId: string,
  size = 20
): Promise<SearchResult> {
  try {
    const available = await isEsAvailable();
    if (!available) {
      return { results: [], degraded: true, message: 'Search service temporarily unavailable' };
    }

    const response = await esClient.search<EmailDocument>({
      index: INDEX,
      size,
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: ['subject^3', 'bodySnippet', 'recipientEmail^2'],
                type: 'best_fields',
                fuzziness: 'AUTO',
              },
            },
          ],
          filter: [
            { term: { userId } }, // only return this user's emails
          ],
        },
      },
    });

    const results = response.hits.hits
      .map((hit) => hit._source)
      .filter((s): s is EmailDocument => s !== undefined);

    return { results, degraded: false };
  } catch (err) {
    console.warn('[es] searchEmails error:', (err as Error).message);
    return { results: [], degraded: true, message: 'Search service temporarily unavailable' };
  }
}
